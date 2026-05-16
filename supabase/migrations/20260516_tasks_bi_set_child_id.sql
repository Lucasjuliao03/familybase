-- Preenche tasks.child_id em INSERT quando o cliente (cache antigo / supabase-js) omite a coluna.
-- Espelha a lógica da app: utilizador com role child + children.user_id = auth.uid(), ou child_id em JWT metadata.

CREATE OR REPLACE FUNCTION public.tasks_bi_set_child_if_missing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r text;
  cid uuid;
  j jsonb;
  meta text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.child_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida: child_id é obrigatório em tarefas.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = uid AND u.family_id = NEW.family_id) THEN
    RAISE EXCEPTION 'family_id não corresponde ao utilizador autenticado.';
  END IF;

  SELECT u.role INTO r FROM public.users u WHERE u.id = uid LIMIT 1;

  IF r = 'child' THEN
    SELECT c.id INTO cid
    FROM public.children c
    WHERE c.family_id = NEW.family_id
      AND c.user_id = uid
    LIMIT 1;

    IF cid IS NOT NULL THEN
      NEW.child_id := cid;
      RETURN NEW;
    END IF;

    BEGIN
      j := COALESCE(to_jsonb(auth.jwt()), '{}'::jsonb);
      meta := trim(COALESCE(j #>> '{user_metadata,child_id}', j #>> '{app_metadata,child_id}', ''));
      IF meta IS NOT NULL AND meta <> '' AND lower(meta) <> 'null' THEN
        cid := meta::uuid;
        IF EXISTS (
          SELECT 1 FROM public.children c
          WHERE c.id = cid AND c.family_id = NEW.family_id
        ) THEN
          NEW.child_id := cid;
          RETURN NEW;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF NEW.child_id IS NULL THEN
    RAISE EXCEPTION
      'child_id é obrigatório. Peça ao gestor para associar o login da criança ao registo do filho (children.user_id) ou actualize a aplicação / limpe cache da PWA.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_bi_set_child_if_missing ON public.tasks;
CREATE TRIGGER tasks_bi_set_child_if_missing
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.tasks_bi_set_child_if_missing();
