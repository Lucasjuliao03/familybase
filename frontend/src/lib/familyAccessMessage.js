import { normalizeFamilyCode, normalizeUsername } from './familyIdentity.js';
const singleLine=value=>String(value||'').replace(/[\r\n\t*_`]/g,' ').replace(/\s+/g,' ').trim();

// Explicit fields only. Passwords and internal Auth identities never enter the draft.
export function buildFamilyAccessMessage({name, familyName, familyCode, username}) {
  const code=normalizeFamilyCode(familyCode);
  const login=normalizeUsername(username);
  if (!code || !login) throw new Error('Aguarde a confirmação dos dados de acesso antes de compartilhar.');
  return `Olá, ${singleLine(name)||'bem-vindo(a)'}! 👋\n\nSeu acesso ao *Tudo de Família* está pronto.\n\n*Família:* ${singleLine(familyName)||'Minha família'}\n*Código da família:* ${code}\n*Usuário:* ${login}\n\n*Como acessar*\n1. Abra o aplicativo Tudo de Família.\n2. Escolha “Código da família” na tela de login.\n3. Informe o código, seu usuário e sua senha pessoal.\n\nPor segurança, esta mensagem não contém senha. Se precisar recuperar o acesso, procure o responsável pela família.\n\nBem-vindo(a) à nossa família no app!`;
}
