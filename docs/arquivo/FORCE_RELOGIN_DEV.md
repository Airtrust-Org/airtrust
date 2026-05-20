# 🔓 FORCE RE-LOGIN NO DESENVOLVIMENTO

## Problema

Você está em `localhost:3000` conectado à API de produção, mas seu token pode não ter permissões de admin.

## Solução Rápida

### 1. Abra o Console do Navegador (F12)

### 2. Cole este código:

```javascript
// Limpar todo localStorage
localStorage.clear();

// Fazer login como admin automaticamente
fetch('https://airtrust-api-production.airtrust.workers.dev/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@airtrust.com',
    password: 'Admin@123',
  }),
})
  .then((r) => r.json())
  .then((data) => {
    if (data.success && data.data?.accessToken) {
      localStorage.setItem('airtrust_token', data.data.accessToken);
      localStorage.setItem('airtrust_refresh_token', data.data.refreshToken);
      localStorage.setItem('airtrust_user', JSON.stringify(data.data.user));
      console.log('✅ Login admin concluído! User:', data.data.user);
      console.log('✅ Recarregando página...');
      setTimeout(() => location.reload(), 1000);
    } else {
      console.error('❌ Login falhou:', data);
    }
  })
  .catch((err) => console.error('❌ Erro:', err));
```

### 3. Aguarde 1 segundo - a página vai recarregar automaticamente

## Verificar Role

Para confirmar que você está como admin:

```javascript
JSON.parse(localStorage.getItem('airtrust_user')).perfil;
// Deve retornar: "ADMIN"
```

## Testar Delete

Agora tente deletar um funcionário - deve funcionar! 🚀
