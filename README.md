# Alerta SP

Site de monitoramento simulado de alagamentos na Grande São Paulo (projeto de extensão UNINOVE · Vila Guardiã / AquaSentinela).

## Como usar
- Abrir no computador: `npm start` e acessar http://localhost:3000
- No Render: o `render.yaml` já está pronto (`npm start`, verificação em `/health`).
- Testes das regras: `npm test`. Testes no navegador: `node tests/e2e.js` (precisa do Playwright).

## Importante
- **Nenhum sensor físico está conectado.** Todo valor é de demonstração, simulado ou ajustado à mão, e a tela informa a origem de cada um.
- Limites de risco (em cm): Normal até 30 · Atenção até 60 · Risco até 90 · Alagamento acima de 90. Ficam em um só lugar: `assets/js/core.js`.
- O mapa é **esquemático**: bairros e cidades têm limites aproximados, sem valor oficial. Para usar limites oficiais, substitua `assets/data/sp-geo.js` (gerado por `tools/build-geo.mjs`).
- As fontes vêm do Google Fonts (precisa de internet; sem ela, o site usa fontes do aparelho).
- Apague os arquivos antigos `style.css`, `report.js` (o `report.html` agora só redireciona).
