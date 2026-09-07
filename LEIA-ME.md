# Voz Railway — Grupos + Chat + tema Operações

Versão com:

- grupos persistentes no SQLite;
- criar grupo e entrar por código de convite;
- lista de grupos na barra lateral;
- chat persistente por grupo, mesmo fora da call;
- lista de membros do grupo;
- canais de voz separados por grupo;
- convite para adicionar pessoas ao grupo;
- dono do grupo pode excluir o grupo; membros podem sair;
- WebRTC/TURN e transmissão 4K adaptativa mantidos;
- visual preto/grafite + verde inspirado em estética tática/BOPE, sem usar brasão ou logotipo oficial.

## Railway

Mantenha as variáveis TURN já configuradas:

- `TURN_URL`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

O banco usa `DATA_DIR=/data` no Railway e cria/migra as novas tabelas automaticamente.

## Observação

O sistema de grupos usa uma identidade local gerada no navegador (`localStorage`). Ele é adequado para este projeto sem login, mas não substitui autenticação real caso você queira contas, permissões fortes ou moderação avançada no futuro.
