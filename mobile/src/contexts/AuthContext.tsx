import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, mapAuthNetworkError } from "../lib/supabase";
import {
  setChildProxy,
  clearChildProxy,
  hydrateChildProxy,
  getChildProxy,
} from "../lib/childProxy";
import { makeProxySession, canActAsChild } from "../lib/proxyAudit";
import { uploadAvatarBase64 } from "../lib/uploadAvatar";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type UserRole = "parent" | "child" | "master" | "relative";

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  family_id?: string;
  access_profile?: string;
  must_change_password?: boolean;
  has_onboarded?: boolean;
  [key: string]: unknown;
}

export interface FamilyData {
  id: string;
  name?: string;
  subscription_status?: string;
  trial_ends_at?: string;
  gestor_user_id?: string;
  [key: string]: unknown;
}

export interface ModulesMap {
  [key: string]: boolean;
}

export interface EffectiveSubscription {
  ok?: boolean;
  has_access: boolean;
  reason?: string;
  family_id?: string | null;
  gestor_id?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  can_manage_billing?: boolean;
  is_billing_contact?: boolean;
}

export interface RegisterFamilyInput {
  familyName: string;
  name: string;
  email: string;
  password: string;
  profileType: "pai" | "mae";
  phone?: string;
  address?: string;
  /** Data de nascimento no formato YYYY-MM-DD. */
  dateOfBirth?: string;
  /** Imagem do avatar em base64 (opcional). */
  avatarBase64?: string | null;
  avatarExt?: string;
}

export interface AuthContextValue {
  user: UserProfile | null;
  profile: UserProfile | null;
  family: FamilyData | null;
  modules: Partial<ModulesMap>;
  childProfile: any | null;
  effectiveSubscription: EffectiveSubscription | null;
  isGestor: boolean;
  mustChangePassword: boolean;
  loading: boolean;
  /** true enquanto família/módulos/assinatura ainda carregam em background */
  profileLoading: boolean;
  /** Filho que o pai está a "encarnar" (modo filho), ou null. */
  actingAsChild: any | null;
  /** true quando o utilizador autenticado está a atuar como um filho. */
  isChildProxy: boolean;
  login: (email: string, password: string) => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  /** Cadastro seguro de uma nova família (responsável pai/mãe = gestor). */
  register: (data: RegisterFamilyInput) => Promise<{ family_id?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearMustChangePassword: () => void;
  /** Entra no perfil de um filho (mantendo a sessão do pai). */
  enterChildProxy: (child: any) => Promise<void>;
  /** Sai do modo filho e volta ao perfil do pai. */
  exitChildProxy: () => Promise<void>;
}

const DEFAULT_MODULES: ModulesMap = {
  tasks: true,
  calendar: true,
  routines: true,
  medals: true,
  grades: true,
  reports: true,
  shopping: true,
  mural: true,
  family_shop: true,
  allowance: true,
  piggy_bank: true,
  goals: true,
  notifications: true,
  health: true,
  location: true,
};

const CACHE_KEY = "familia_profile_cache";
const CACHE_TTL_MS = 10 * 60 * 1000;
const SESSION_CHECK_MS = 2_000;
const UI_RELEASE_MS = 400;

const AuthContext = createContext<AuthContextValue | null>(null);

function buildEffectiveSubscriptionFallback(
  profileRow: UserProfile,
  resolvedFamily: FamilyData | null,
  userId: string,
): EffectiveSubscription {
  const fam = resolvedFamily;
  if (!fam || !profileRow?.family_id) {
    return {
      ok: true,
      has_access: false,
      reason: "no_family",
      family_id: profileRow?.family_id ?? null,
      gestor_id: null,
      subscription_status: null,
      trial_ends_at: null,
      can_manage_billing: false,
      is_billing_contact: false,
    };
  }
  const sub = fam.subscription_status || "trial";
  let hasAccess = false;
  let reason = "no_subscription";
  const endsTs = fam.trial_ends_at
    ? new Date(fam.trial_ends_at).getTime()
    : null;
  const trialAlive =
    endsTs != null && !Number.isNaN(endsTs) ? endsTs >= Date.now() : false;

  if (sub === "active") {
    hasAccess = true;
    reason = "subscription_active";
  } else if (sub === "trial") {
    if (trialAlive || fam.trial_ends_at == null) {
      hasAccess = true;
      reason = "trial_active";
    } else {
      reason = "trial_expired";
    }
  } else if (sub === "past_due") {
    reason = "subscription_past_due";
  } else if (sub === "expired" || sub === "cancelled") {
    reason = "subscription_blocked";
  }

  let canManage = false;
  if (profileRow.role === "parent") {
    const ap = profileRow.access_profile ?? "gestor";
    if (ap === "gestor") {
      const gid = fam.gestor_user_id;
      canManage = !gid ? true : gid === userId;
    }
  }

  return {
    ok: true,
    has_access: hasAccess,
    reason,
    family_id: fam.id,
    gestor_id: fam.gestor_user_id ?? null,
    subscription_status: fam.subscription_status ?? null,
    trial_ends_at: fam.trial_ends_at ?? null,
    can_manage_billing: canManage,
    is_billing_contact: canManage,
  };
}

async function raceMs<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | undefined> {
  const boxed = await Promise.race([
    promise.then((v) => ({ ok: true as const, v })),
    new Promise<{ ok: false }>((resolve) =>
      setTimeout(() => resolve({ ok: false }), ms),
    ),
  ]);
  return boxed.ok ? boxed.v : undefined;
}

export function isFamilyBillingBlocked(
  family: FamilyData | null,
  effectiveSubscription: EffectiveSubscription | null,
): boolean {
  if (
    effectiveSubscription &&
    typeof effectiveSubscription.has_access === "boolean"
  ) {
    return !effectiveSubscription.has_access;
  }
  if (!family?.trial_ends_at) return false;
  const ends = new Date(family.trial_ends_at).getTime();
  if (Number.isNaN(ends)) return false;
  const sub = family.subscription_status || "trial";
  if (sub === "active") return false;
  if (sub === "trial") return ends < Date.now();
  return sub === "expired" || sub === "cancelled" || sub === "past_due";
}

export function userCanManageFamilyBilling(
  user: UserProfile | null,
  effectiveSubscription: EffectiveSubscription | null,
): boolean {
  if (effectiveSubscription?.can_manage_billing === true) return true;
  if (effectiveSubscription?.can_manage_billing === false) return false;
  if (!user || user.role === "child" || user.role === "relative") return false;
  if (user.role === "parent") {
    const ap = user.access_profile ?? "gestor";
    return ap === "gestor";
  }
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [modules, setModules] = useState<Partial<ModulesMap>>({});
  const [childProfile, setChildProfile] = useState<any | null>(null);
  const [effectiveSubscription, setEffectiveSubscription] =
    useState<EffectiveSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [actingChild, setActingChild] = useState<any | null>(null);

  const isGestor = useMemo(() => {
    if (!user || user.role !== "parent") return false;
    if (family?.gestor_user_id && user.id === family.gestor_user_id)
      return true;
    return (user.access_profile ?? "gestor") === "gestor";
  }, [user, family]);

  const mustChangePassword = useMemo(() => {
    if (!user) return false;
    const v = user.must_change_password;
    return v === true || (v as any) === 1 || String(v).toLowerCase() === "true";
  }, [user]);

  const clearMustChangePassword = useCallback(() => {
    setUser((prev) => (prev ? { ...prev, must_change_password: false } : prev));
  }, []);

  const isMountedRef = useRef(true);
  const inflightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const safeSetLoading = useCallback((val: boolean) => {
    if (isMountedRef.current) setLoading(val);
  }, []);

  const loadProfile = useCallback(
    async (
      userId: string,
      emailHint?: string,
      opts: { awaitReady?: boolean; awaitFull?: boolean } = {},
    ): Promise<void> => {
      if (inflightRef.current) {
        if (opts.awaitFull || opts.awaitReady) await inflightRef.current;
        return;
      }

      let resolveReady: (() => void) | undefined;
      let rejectReady: ((e: unknown) => void) | undefined;
      const readyPromise = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });

      const promise = (async () => {
        setProfileLoading(true);
        try {
          const { data: profileRow, error: profileErr } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

          if (!isMountedRef.current) return;

          if (profileErr || !profileRow) {
            setUser(null);
            setFamily(null);
            setModules({});
            setChildProfile(null);
            setEffectiveSubscription(null);
            rejectReady?.(profileErr || new Error("profile_not_found"));
            return;
          }

          const userObj: UserProfile = {
            ...profileRow,
            email: emailHint || (profileRow.email as string) || "",
          } as UserProfile;

          setUser(userObj);
          resolveReady?.();

          const fid = profileRow.family_id as string | undefined;
          const wantsChildRow = profileRow.role === "child";

          const [familyResult, modulesResult, childResult] = await Promise.all([
            fid
              ? supabase
                  .from("families")
                  .select("*")
                  .eq("id", fid)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            fid
              ? supabase
                  .from("family_modules")
                  .select("module_key, is_enabled")
                  .eq("family_id", fid)
              : Promise.resolve({ data: [] }),
            wantsChildRow
              ? supabase
                  .from("children")
                  .select("*")
                  .eq("user_id", userId)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          if (!isMountedRef.current) return;

          let effectiveChildRow = childResult?.data;
          if (!effectiveChildRow && wantsChildRow && fid) {
            effectiveChildRow = await fetchChildProfileRowByAuth(userId, fid);
          }

          let resolvedFamily = (familyResult.data as FamilyData) ?? null;

          let effSub: EffectiveSubscription;
          try {
            const rpcRes = (await raceMs(
              supabase.rpc("get_effective_subscription") as any,
              2500,
            )) as any;
            const effData = rpcRes?.data;
            const effErr = rpcRes?.error;
            if (!effErr && effData != null && typeof effData === "object") {
              effSub = effData as EffectiveSubscription;
              const fidEFF = effSub.family_id ?? fid;
              if (
                resolvedFamily &&
                fidEFF &&
                String(resolvedFamily.id) === String(fidEFF)
              ) {
                resolvedFamily = {
                  ...resolvedFamily,
                  subscription_status:
                    effSub.subscription_status ??
                    resolvedFamily.subscription_status,
                  trial_ends_at:
                    effSub.trial_ends_at ?? resolvedFamily.trial_ends_at,
                };
              }
            } else {
              throw effErr || new Error("rpc_effective_subscription");
            }
          } catch {
            effSub = buildEffectiveSubscriptionFallback(
              profileRow as UserProfile,
              resolvedFamily,
              userId,
            );
          }

          const mergedMods: ModulesMap = { ...DEFAULT_MODULES };
          (
            (modulesResult.data ?? []) as {
              module_key: string;
              is_enabled: boolean;
            }[]
          ).forEach((r) => {
            if (r.module_key) mergedMods[r.module_key] = !!r.is_enabled;
          });

          setFamily(resolvedFamily);
          setModules(mergedMods);
          setChildProfile(effectiveChildRow ?? null);
          setEffectiveSubscription(effSub);

          try {
            await AsyncStorage.setItem(
              CACHE_KEY,
              JSON.stringify({
                user: userObj,
                family: resolvedFamily,
                modules: mergedMods,
                childProfile: effectiveChildRow ?? null,
                effectiveSubscription: effSub,
                _at: Date.now(),
              }),
            );
          } catch {
            /* storage cheio */
          }
        } catch (err) {
          console.error("[Auth] loadProfile erro:", err);
          rejectReady?.(err);
          if (isMountedRef.current) {
            setUser(null);
            setFamily(null);
            setModules({});
            setChildProfile(null);
            setEffectiveSubscription(null);
          }
        } finally {
          inflightRef.current = null;
          if (isMountedRef.current) setProfileLoading(false);
        }
      })();

      inflightRef.current = promise;

      if (opts.awaitFull) {
        await promise;
      } else if (opts.awaitReady) {
        await readyPromise;
        promise.catch((e) => console.warn("[Auth] loadProfile background:", e));
      } else {
        promise.catch((e) => console.warn("[Auth] loadProfile background:", e));
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let cachedUserId: string | null = null;
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (
            cached?._at &&
            Date.now() - cached._at < CACHE_TTL_MS &&
            cached.user
          ) {
            cachedUserId = cached.user.id ?? null;
            setUser(cached.user);
            setFamily(cached.family ?? null);
            setModules(cached.modules ?? { ...DEFAULT_MODULES });
            setChildProfile(cached.childProfile ?? null);
            setEffectiveSubscription(cached.effectiveSubscription ?? null);
          }
        }
      } catch {
        /* noop */
      }

      // Liberta a UI logo (login visível) — validação Supabase corre em paralelo
      const releaseTimer = setTimeout(() => {
        if (!cancelled && isMountedRef.current) safeSetLoading(false);
      }, UI_RELEASE_MS);

      try {
        const sessWrap = await raceMs(
          supabase.auth.getSession(),
          SESSION_CHECK_MS,
        );
        clearTimeout(releaseTimer);
        if (!cancelled && isMountedRef.current) safeSetLoading(false);

        if (cancelled) return;

        if (!sessWrap) {
          if (!cachedUserId) {
            setUser(null);
            setFamily(null);
            setModules({});
            setChildProfile(null);
            setEffectiveSubscription(null);
          }
          return;
        }

        const {
          data: { session },
          error,
        } = sessWrap;

        if (error) return;

        if (session?.user) {
          const em =
            session.user.email ||
            (session.user.user_metadata?.email as string) ||
            "";
          loadProfile(session.user.id, em).catch(console.warn);
          hydrateChildProxyInBackground(cancelled);
        } else {
          setUser(null);
          setFamily(null);
          setModules({});
          setChildProfile(null);
          setEffectiveSubscription(null);
          try {
            await AsyncStorage.removeItem(CACHE_KEY);
          } catch {
            /* noop */
          }
        }
      } catch (e) {
        clearTimeout(releaseTimer);
        console.error("[Auth] hydrate erro:", e);
        if (!cancelled && isMountedRef.current) safeSetLoading(false);
      }
    }

    async function hydrateChildProxyInBackground(isCancelled: boolean) {
      try {
        const restored = await hydrateChildProxy();
        if (restored?.childProfileId && !isCancelled && isMountedRef.current) {
          const { data: childRow } = await supabase
            .from("children")
            .select("*")
            .eq("id", restored.childProfileId)
            .maybeSingle();
          if (childRow) setActingChild(childRow);
          else await clearChildProxy();
        }
      } catch {
        /* noop */
      }
    }

    hydrate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;

      if (event === "SIGNED_OUT" || !session?.user) {
        try {
          await clearChildProxy();
        } catch {
          /* noop */
        }
        if (isMountedRef.current) {
          setUser(null);
          setFamily(null);
          setModules({});
          setChildProfile(null);
          setEffectiveSubscription(null);
          setActingChild(null);
          safeSetLoading(false);
        }
        try {
          await AsyncStorage.removeItem(CACHE_KEY);
        } catch {
          /* noop */
        }
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const em =
          session.user.email ||
          (session.user.user_metadata?.email as string) ||
          "";
        loadProfile(session.user.id, em).catch(console.warn);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile, safeSetLoading]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw new Error(error.message);
        if (!data.user) throw new Error("Usuário não encontrado após login.");
        await loadProfile(data.user.id, email, { awaitReady: true });
      } catch (e) {
        throw mapAuthNetworkError(e);
      }
    },
    [loadProfile],
  );

  const resendVerificationEmail = useCallback(
    async (email: string): Promise<void> => {
      const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();
      if (!normalizedEmail) throw new Error("Informe um email válido.");

      try {
        const { error } = await supabase.auth.resend({
          type: "signup",
          email: normalizedEmail,
        });
        if (error) throw new Error(error.message);
      } catch (e) {
        throw mapAuthNetworkError(e);
      }
    },
    [],
  );

  const register = useCallback(
    async (data: RegisterFamilyInput): Promise<{ family_id?: string }> => {
      const email = String(data.email || "")
        .trim()
        .toLowerCase();
      const password = String(data.password || "");
      const familyName = (data.familyName || "").trim() || null;
      const name = (data.name || "").trim() || null;
      const profileType =
        String(data.profileType || "pai").toLowerCase() === "mae"
          ? "mae"
          : "pai";

      try {
        safeSetLoading(true);

        // 1) Criar usuário no Supabase Auth (senha cifrada pelo Supabase).
        const { data: signUpData, error: signUpErr } =
          await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                name,
                family_name: familyName,
                profile_type: profileType,
              },
            },
          });
        if (signUpErr) {
          let hint = "";
          if (
            signUpErr.message?.includes("already registered") ||
            (signUpErr as any).code === "user_already_exists"
          ) {
            hint = " Este email já tem conta — faça login ou use outro email.";
          }
          throw new Error(`${signUpErr.message}${hint}`);
        }

        // 2) Garantir usuário cadastrado (se a confirmação de email estiver ativa, não vem sessão).
        const user = signUpData.user;
        if (!user) throw new Error("Usuário não cadastrado.");
        if (user.identities && user.identities.length === 0) {
          throw new Error(
            "Erro ao criar usuário, por favor verifique seu email ou tente usar outro.",
          );
        }

        // 3) Avatar opcional → upload para o bucket público (best-effort).
        let avatarUrl: string | null = null;
        if (data.avatarBase64) {
          try {
            avatarUrl = await uploadAvatarBase64(
              user.id,
              data.avatarBase64,
              data.avatarExt || "jpg",
            );
          } catch (e) {
            console.warn(
              "[Auth] upload de avatar falhou (ignorado):",
              (e as Error)?.message,
            );
          }
        }

        // 4) RPC: cria família com trial de 7 dias + perfil do responsável (gestor).
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "register_family_and_user_2",
          {
            p_user_id: user.id,
            p_user_name: name,
            p_contact_email: email,
            p_family_name: familyName,
            p_phone: data.phone?.trim() || null,
          },
        );
        if (rpcErr) throw new Error(rpcErr.message);

        // 5) Carregar o perfil já com família resolvida.
        // await loadProfile(uid, email, { awaitFull: true }); /** não é necessário já que não é feito mais o login automático após singup */
        return { family_id: rpcData?.family_id || null }; // talvez retornar o usuário??????
      } catch (e) {
        safeSetLoading(false);
        throw mapAuthNetworkError(e);
      }
    },
    [loadProfile, safeSetLoading],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await clearChildProxy();
    } catch {
      /* noop */
    }
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* noop */
    }
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch {
      /* noop */
    }
    if (isMountedRef.current) {
      setUser(null);
      setFamily(null);
      setModules({});
      setChildProfile(null);
      setEffectiveSubscription(null);
      setActingChild(null);
      safeSetLoading(false);
    }
  }, [safeSetLoading]);

  const refreshProfile = useCallback(async (): Promise<void> => {
    // Em modo filho, atualizar a linha do filho ativo (XP/moedas/saldo) em vez
    // de recarregar o perfil do pai — assim as telas do filho refletem o ganho.
    const proxy = getChildProxy();
    if (proxy?.childProfileId) {
      const { data: freshChild } = await supabase
        .from("children")
        .select("*")
        .eq("id", proxy.childProfileId)
        .maybeSingle();
      if (freshChild) {
        setActingChild(freshChild);
        return;
      }
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;
    await loadProfile(session.user.id, session.user.email || "");
  }, [loadProfile]);

  const enterChildProxy = useCallback(
    async (child: any): Promise<void> => {
      if (!user?.id) throw new Error("Sessão inválida.");
      if (!child?.id) throw new Error("Selecione um filho válido.");

      // Garante a linha completa e atualizada do filho (inclui family_id).
      let childRow = child;
      const { data: freshChild } = await supabase
        .from("children")
        .select("*")
        .eq("id", child.id)
        .maybeSingle();
      if (freshChild) childRow = freshChild;

      // Segurança (requisito 6): só pais/gestores/parentes/master atuam como filho,
      // e o filho tem de pertencer à mesma família.
      const childFamilyId =
        childRow.family_id ?? (user.family_id as string | undefined);
      if (
        !canActAsChild(
          user.role,
          user.family_id as string | undefined,
          childFamilyId,
        )
      ) {
        throw new Error(
          "Apenas pais/gestores podem entrar no perfil de um filho.",
        );
      }

      const session = makeProxySession({
        child: childRow,
        parent: {
          id: user.id,
          name: user.name,
          family_id: user.family_id as string | undefined,
        },
      });
      setChildProxy(session);
      setActingChild(childRow);
    },
    [user],
  );

  const exitChildProxy = useCallback(async (): Promise<void> => {
    await clearChildProxy();
    setActingChild(null);
  }, []);

  const isChildProxy = !!actingChild;
  const effectiveChildProfile = actingChild ?? childProfile;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: user,
        family,
        modules,
        childProfile: effectiveChildProfile,
        effectiveSubscription,
        isGestor,
        mustChangePassword,
        loading,
        profileLoading,
        actingAsChild: actingChild,
        isChildProxy,
        login,
        resendVerificationEmail,
        register,
        logout,
        refreshProfile,
        clearMustChangePassword,
        enterChildProxy,
        exitChildProxy,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

async function fetchChildProfileRowByAuth(
  userId: string,
  familyId: string,
): Promise<any | null> {
  if (!userId || !familyId) return null;
  const { data: byUser } = await supabase
    .from("children")
    .select("*")
    .eq("user_id", userId)
    .eq("family_id", familyId)
    .maybeSingle();
  if (byUser) return byUser;

  const { data: sessWrap, error: sessErr } = await supabase.auth.getSession();
  if (
    sessErr ||
    !sessWrap?.session?.user ||
    sessWrap.session.user.id !== userId
  )
    return null;
  const { user } = sessWrap.session;
  const um = user.user_metadata || {};
  const am = user.app_metadata || {};
  const raw = um.child_id || um.childId || am.child_id || am.childId;
  const meta = raw != null ? String(raw).trim() : "";
  if (!meta || meta === "undefined") return null;

  const { data: byMeta } = await supabase
    .from("children")
    .select("*")
    .eq("family_id", familyId)
    .eq("id", meta)
    .maybeSingle();
  return byMeta || null;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
