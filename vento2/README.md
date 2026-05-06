# Dashboard Meteorológico Completo

Um sistema robusto de dashboard meteorológico que combina múltiplas fontes de dados para maior precisão e confiabilidade.

## Funcionalidades

- **Modo Demo Automático**: Usa clima fictício local sem chaves de API.
- **Dados Simulados**: Preenche temperatura, umidade, vento e precipitação com valores estáveis.
- **Fallback Automático**: A interface continua funcionando mesmo offline.
- **Clima Atual**: Temperatura, sensação térmica, umidade, precipitação, velocidade do vento.
- **Previsão Horária**: Gráfico de temperatura ao longo do dia.
- **Previsão Semanal**: Previsão para os próximos 7 dias.
- **Busca por Cidade**: Permite buscar dados de qualquer cidade.
- **Geolocalização**: Detecta localização automática do usuário.
- **Atualização Automática**: Dados atualizados automaticamente a cada 5 minutos.
- **Feedback Visual**: Indicador de status mostrando quando os dados estão sendo atualizados.
- **Avaliação para Voo de Drone**: Sistema inteligente que analisa condições meteorológicas e índice geomagnético (Kp) para determinar se é seguro voar com drone.
- **Status Visual**: 🟢 Bom para voar, 🟡 Voe com cautela, 🔴 Não recomendável voar.
- **Interface Moderna**: Tema escuro, responsivo, ícones dinâmicos.

## Tecnologias Utilizadas

- HTML5
- CSS3
- JavaScript (ES6+)
- Fetch API
- Chart.js para gráficos
- Dados demo em JavaScript, sem provedor com chave

## Como Usar

1. Abra `index.html` em um navegador web.
2. Use a busca para selecionar uma cidade ou clique em "Usar Localização" para dados automáticos.
3. Os dados serão carregados e atualizados automaticamente a cada 5 minutos.
4. Verifique o status de voo de drone baseado nas condições atuais.

## Configuração de APIs

Nenhuma chave é necessária. O projeto carrega automaticamente com dados climáticos fictícios.

## Estrutura do Projeto

- `index.html`: Estrutura da página
- `style.css`: Estilos CSS
- `script.js`: Lógica JavaScript
- `README.md`: Documentação

## Regras de Avaliação para Voo de Drone

O sistema avalia as seguintes condições:

- **Vento**: Até 15 km/h (seguro), 15-25 km/h (atenção), acima de 25 km/h (perigoso)
- **Rajadas**: Acima de 30 km/h (não recomendável)
- **Chuva**: Qualquer precipitação (não recomendável)
- **Tempestade**: Proibido voar
- **Visibilidade**: Menor que 2000m (atenção), menor que 1000m (não recomendável)
- **Umidade**: Acima de 90% (atenção)
- **Temperatura**: Abaixo de 0°C ou acima de 40°C (atenção)
- **Índice Kp**: 0-3 (seguro), 4-5 (atenção), 6+ (não recomendável - possível interferência GPS)

O status final prioriza sempre a condição mais crítica.

## Desenvolvimento

Para modificar:
- Adicione mais APIs no `script.js`.
- Ajuste estilos em `style.css`.
- Expanda funcionalidades no JavaScript.

## Licença

Este projeto é para fins educacionais.
