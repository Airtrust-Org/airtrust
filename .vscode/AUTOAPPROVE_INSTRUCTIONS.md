# Autoapprove / Copilot Auto-accept — Instruções

Este arquivo descreve como ativar completamente o fluxo "AUTOAPPROVE" no macOS (zsh).

1) Instalar o comando `code` no PATH (no VS Code):
- Abra o VS Code
- Cmd+Shift+P -> "Shell Command: Install 'code' command in PATH"
- Feche e reabra o terminal

2) Instalar extensões (rodar no terminal macOS após passo 1):

```bash
code --install-extension GitHub.copilot
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
code --install-extension bradlc.vscode-tailwindcss
code --install-extension ms-vscode.vscode-typescript-next
```

3) Reiniciar VS Code:

```bash
# fechar
osascript -e 'tell application "Visual Studio Code" to quit'
# abrir (na pasta do projeto)
code .
```

4) Teste rápido (no projeto):
- Criar `test-autoapprove.ts` com o snippet: 

```ts
import { useState } from 'react';
export function TestComponent() {
  const [count, setCount] = useState(0);
  return <div onClick={() => setCount(c => c + 1)}>{count}</div>;
}
```

- Comece a digitar; Copilot deve oferecer sugestão inline. Pressione `TAB` para aceitar.
- Ao salvar, Prettier/Eslint irão formatar/fixar automaticamente (configurado no projeto).

5) Se algo falhar:
- `code` não existe: execute o passo 1.
- Extensão Copilot não instalada: execute o passo 2.
- Sugestões inline não aparecem: verifique `"github.copilot.enable"` em `.vscode/settings.json` e que `editor.inlineSuggest.enabled` está `true`.

6) Segurança / Privacidade
- As configurações acima ativam Copilot no workspace; ajuste `github.copilot.enable` se preferir desligar para certos tipos.

---

Arquivos criados automaticamente:
- `.vscode/settings.json`
- `.vscode/extensions.json`
- `.vscode/keybindings.json`
- `.eslintrc.json`
- `.prettierrc`

Commit sugerido: `chore: add vscode autoapprove config`
