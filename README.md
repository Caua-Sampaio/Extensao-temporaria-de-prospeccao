# Extrator Google Maps (Firefox)

Extensão que rola a lista de resultados do Google Maps e exporta nome, informações e link de cada empresa em CSV.

## Como testar

1. No Firefox, acesse `about:debugging#/runtime/this-firefox`.
2. Clique em **Carregar extensão temporária** e escolha o `manifest.json`.
3. Abra o Google Maps, faça uma busca (ex.: "clínicas dermatológicas Sorocaba") e clique em **Extrair CSV**.

A extensão temporária some ao fechar o Firefox.

## Observações

- Use com moderação. A extração automatizada vai contra os termos do Google Maps.
- Se o Google mudar o HTML, os seletores `div[role="feed"]` e `a[href*="/maps/place/"]` podem precisar de ajuste.
- Se a página já estava aberta antes de instalar, recarregue para o botão aparecer.
- Dados de contato de pessoas físicas estão sujeitos à LGPD.
