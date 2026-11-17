(() => {
  if (document.getElementById('gmaps-extractor-btn')) return;

  const COLUNAS = [
    'Empresa', 'Dono(a)', 'Avaliações', 'Qtd. avaliações', 'Horário', 'Telefone',
    'Instagram', 'Status do site', 'Link do site', 'Bairro', 'Nicho', 'Origem'
  ];

  const btn = document.createElement('button');
  btn.id = 'gmaps-extractor-btn';
  btn.textContent = 'Extrair CSV';
  Object.assign(btn.style, {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: '99999',
    padding: '12px 16px', background: '#1a73e8', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '14px', boxShadow: '0 2px 8px rgba(0,0,0,.3)'
  });
  document.body.appendChild(btn);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getFeed = () => document.querySelector('div[role="feed"]');

  // Procura um nome de responsável no título, como "Dra. Paolla Dorneles | ..."
  // ou "Dr. João Silva - Clínica ...". O título continua sendo a Empresa.
  function extrairDono(titulo) {
    const m = titulo.match(
      /\b(?:Dr\.?a?|Dra\.?|Doutor(?:a)?)\s+((?:\p{Lu}\p{Ll}+)(?:\s+(?:de|da|do|dos|das|e)?\s*\p{Lu}\p{Ll}+){0,3})/u
    );
    return m ? m[1].split(/\s+/)[0] : '';
  }

  // Bairro: o trecho entre o último " - " e a vírgula antes da cidade.
  // Ex.: "Av. Pereira da Silva, 1163 - SALA 07 - Jardim Santa Rosália, Sorocaba - SP" -> "Jardim Santa Rosália"
  function extrairBairro(texto) {
    const m = (texto || '').match(/-\s*([^-,\n]+?),\s*[^,\n-]+?\s*-\s*[A-Z]{2}\b/);
    return m ? m[1].trim() : '';
  }

  // Quantidade de avaliações, ex.: "5,0 ★★★★★ (20)" -> 20
  function extrairQtdAvaliacoes(card, linhas) {
    // 1) Texto de acessibilidade, ex.: "5,0 estrelas 20 avaliações"
    for (const el of card.querySelectorAll('[aria-label]')) {
      const m = el.getAttribute('aria-label').match(/(\d[\d.]*)\s*(?:avalia|review)/i);
      if (m) return m[1].replace(/\./g, '');
    }

    // 2) Linha que começa com a nota e tem a quantidade entre parênteses
    for (const l of linhas) {
      if (!/^\d[.,]\d\b/.test(l)) continue;
      const m = l.match(/\((\d[\d.]*)\)/);
      if (m) return m[1].replace(/\./g, '');
    }

    return '';
  }

  // Nota de 1 a 5 com uma casa decimal, no formato 0,0 (ex.: 4,9)
  function normalizarNota(valor) {
    const n = parseFloat(String(valor).replace(',', '.'));
    if (isNaN(n) || n < 1 || n > 5) return '';
    return n.toFixed(1).replace('.', ',');
  }

  function extrairAvaliacoes(card, linhas) {
    // 1) Melhor fonte: o aria-label das estrelas, ex.: "4,9 estrelas"
    for (const el of card.querySelectorAll('[aria-label]')) {
      const m = el.getAttribute('aria-label').match(/(\d(?:[.,]\d)?)\s*(?:estrela|star)/i);
      if (m) {
        const nota = normalizarNota(m[1]);
        if (nota) return nota;
      }
    }

    // 2) Alternativa: linha que começa com a nota, ex.: "4,9 ★★★★★ (56)"
    for (const l of linhas) {
      const m = l.match(/^(\d[.,]\d)\b/);
      if (m) {
        const nota = normalizarNota(m[1]);
        if (nota) return nota;
      }
    }

    return '';
  }

  // Extrai os campos do card de uma empresa
  function parseCard(a) {
    const empresa = a.getAttribute('aria-label') || '';
    const card = a.closest('div[role="article"]') || a.parentElement;
    const texto = card.innerText;
    const linhas = texto.split('\n').map(s => s.trim()).filter(Boolean);

    // Telefone brasileiro
    const tel = texto.match(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/);
    const telefone = tel ? tel[0].trim() : '';

    // Horário: linha que começa com Aberto/Fechado
    const horario = (linhas.find(l => /^(Aberto|Fechado)/i.test(l)) || '')
      .replace(/\s*·\s*\(\d{2}\)\s?\d{4,5}-?\d{4}\s*$/, '')
      .trim();

    // Nicho: linha logo após a linha de avaliação
    const idxAv = linhas.findIndex(l => /\d[.,]\d/.test(l) && /\(\d[\d.]*\)/.test(l));
    const nicho = idxAv >= 0 && linhas[idxAv + 1]
      ? linhas[idxAv + 1].split('·')[0].trim()
      : '';

    // Bairro: lido do endereço no card
    const bairro = extrairBairro(texto);

    // Status do site: se o card tem botão de site
    const botaoSite = card.querySelector(
      'a[data-item-id="authority"], a[data-value="Website"], a[aria-label*="site" i]'
    );
    const temSite = !!botaoSite;
    const linkSite = botaoSite ? botaoSite.href : '';

    return {
      'Empresa': empresa,
      'Dono(a)': extrairDono(empresa),
      'Avaliações': extrairAvaliacoes(card, linhas),
      'Qtd. avaliações': extrairQtdAvaliacoes(card, linhas),
      'Horário': horario,
      'Telefone': telefone,
      'Instagram': '',
      'Status do site': temSite ? 'Possui site' : 'Não verificado',
      'Link do site': linkSite,
      'Bairro': bairro,
      'Nicho': nicho,
      'Origem': 'Google Maps'
    };
  }

  function collectVisible(results) {
    document.querySelectorAll('a[href*="/maps/place/"]').forEach(a => {
      const link = a.href;
      if (results.has(link)) return;
      const dados = parseCard(a);
      if (!dados['Empresa']) return;
      if (/^Conta do Google/i.test(dados['Empresa'])) return;
      dados['Empresa'] = dados['Empresa'].replace(/\s*\n\s*/g, ' ').trim();
      dados._link = link;
      results.set(link, dados);
    });
  }

  const META = 20;

  // Detecta que o Google chegou ao fim da lista
  function fimDaLista() {
    const feed = getFeed();
    const texto = feed ? feed.innerText : '';
    return /chegou ao fim|reached the end/i.test(texto);
  }

  async function autoScroll(results) {
    let semNovidade = 0;

    // Continua até juntar 100 empresas, até o usuário parar,
    // ou até a lista acabar / não trazer mais nada novo por várias tentativas.
    // A lista é buscada de novo a cada passo, porque o Google a recria
    // sempre que uma empresa é aberta.
    while (results.size < META && semNovidade < 8 && !parar) {
      const feed = getFeed();
      if (!feed) {
        semNovidade++;
        await sleep(1000);
        continue;
      }

      const antes = results.size;
      collectVisible(results);
      feed.scrollBy(0, feed.clientHeight);
      await sleep(2000);
      semNovidade = results.size === antes ? semNovidade + 1 : 0;

      if (fimDaLista()) break;
    }
    collectVisible(results);
  }

  // Centro do mapa atual, lido da URL (trecho "@lat,lng")
  function centroDoMapa() {
    const m = location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
  }

  // Coordenadas da empresa, lidas do link do lugar (trecho "!3d...!4d...")
  function coordsDoLink(link) {
    const m = link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
  }

  // Distância em km entre dois pontos (fórmula de Haversine)
  function distanciaKm(a, b) {
    const R = 6371;
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Ordena do mais próximo para o mais distante, remove empresas repetidas e limita a 100
  function ordenarEDeduplicar(results) {
    const centro = centroDoMapa();
    const entradas = [...results.entries()];

    if (centro) {
      const dist = ([link]) => {
        const c = coordsDoLink(link);
        return c ? distanciaKm(centro, c) : 1e9;
      };
      entradas.sort((x, y) => dist(x) - dist(y));
    }

    const vistos = new Set();
    const linhas = [];
    for (const [, dados] of entradas) {
      const chave = dados['Empresa'].trim().toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      linhas.push(dados);
      if (linhas.length >= META) break;
    }
    return linhas;
  }

  // O Google às vezes envolve o site num redirecionamento (google.com/url?q=...)
  function linkReal(href) {
    try {
      const u = new URL(href);
      if (u.hostname.endsWith('google.com') && u.pathname === '/url') {
        return u.searchParams.get('q') || href;
      }
    } catch (_) {}
    return href;
  }

  function acharCardPorLink(link) {
    return Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
      .find(a => a.href === link) || null;
  }

  // Abre a empresa e lê o site e o telefone do painel de detalhes
  // Procura o card; se ele não estiver renderizado, rola a lista até achar
  async function acharCardComRolagem(link) {
    let card = acharCardPorLink(link);
    for (let i = 0; i < 20 && !card; i++) {
      const feed = getFeed();
      if (!feed) break;
      feed.scrollBy(0, feed.clientHeight);
      await sleep(800);
      card = acharCardPorLink(link);
    }
    return card;
  }

  async function lerSiteETelefone(link, nomeEmpresa) {
    const card = await acharCardComRolagem(link);
    if (!card) return null;

    const tituloAntes = document.title;
    const nomeCurto = (nomeEmpresa || '').slice(0, 15).toLowerCase();

    // O painel abriu quando o título da aba mudou, ou quando o nome da empresa aparece no painel
    const painelDaEmpresa = () => {
      const h1 = (document.querySelector('h1')?.textContent || '').toLowerCase();
      return document.title !== tituloAntes || (nomeCurto && h1.includes(nomeCurto));
    };

    const esperarPainel = async () => {
      for (let t = 0; t < 8; t++) {
        await sleep(500);
        if (painelDaEmpresa()) return true;
      }
      return false;
    };

    // Primeira tentativa: clique no próprio link do card
    card.click();
    let carregou = await esperarPainel();

    // Segunda tentativa: clique no container do card, com eventos de mouse
    if (!carregou) {
      const alvo = card.closest('div[role="article"]') || card;
      for (const tipo of ['mousedown', 'mouseup', 'click']) {
        alvo.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: window }));
      }
      carregou = await esperarPainel();
    }

    // Espera o site e o telefone aparecerem no painel
    await sleep(1200);

    const telEl = document.querySelector('button[data-item-id^="phone"]');

    return {
      carregou,
      site: acharSiteNoPainel(),
      instagram: acharInstagramNoPainel(),
      bairro: extrairBairro(
        document.querySelector('button[data-item-id="address"]')?.getAttribute('aria-label') ||
        document.querySelector('button[data-item-id="address"]')?.textContent ||
        ''
      ),
      telefone: telEl ? telEl.textContent.trim() : ''
    };
  }

  // Acha o perfil do Instagram no painel aberto (link ou texto do tipo instagram.com/perfil)
  function acharInstagramNoPainel() {
    const links = Array.from(document.querySelectorAll('a[href*="instagram.com"]'));
    for (const a of links) {
      const url = linkReal(a.href);
      if (/instagram\.com\/[^/?#\s]+/i.test(url)) return url;
    }

    const textoComIg = Array.from(document.querySelectorAll('[data-item-id], button, a'))
      .map(el => (el.textContent || '').trim())
      .find(t => /instagram\.com\/[^\s/?#]+/i.test(t));
    if (textoComIg) {
      const m = textoComIg.match(/instagram\.com\/[^\s/?#]+/i);
      return 'https://' + m[0];
    }

    return '';
  }

  // Acha o site do negócio no painel aberto
  function acharSiteNoPainel() {
    // 1) Botão padrão de site do Maps (pode ser link ou botão com o domínio como texto)
    const botao = document.querySelector(
      '[data-item-id="authority"], a[aria-label*="Site" i], a[aria-label*="Website" i]'
    );
    if (botao) {
      if (botao.tagName === 'A' && botao.href && !/google\./i.test(botao.href)) {
        return linkReal(botao.href);
      }
      const dominio = (botao.textContent || '').trim()
        .match(/(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/i);
      if (dominio) return 'https://' + dominio[0];
    }

    // 2) Qualquer link externo cujo texto visível seja um domínio, ex.: "monisemarins.com.br"
    const links = Array.from(document.querySelectorAll('a[href^="http"]'));
    const alvo = links.find(a => {
      const texto = a.textContent.trim();
      return /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?$/i.test(texto)
        && !/google\.|wa\.me|maps\./i.test(a.href);
    });
    return alvo ? linkReal(alvo.href) : '';
  }

  // Volta da página de detalhes para a lista de resultados
  function voltarParaLista() {
    const botao = document.querySelector('button[aria-label="Voltar"], button[aria-label="Back"]');
    if (botao) botao.click();
    else history.back();
  }

  // Preenche Link do site, Status do site e Telefone visitando cada empresa
  async function preencherSites(linhas) {
    // Passada 1: todas as empresas. Passada 2: só as que ficaram sem leitura.
    for (const passada of [1, 2]) {
      const pendentes = linhas.filter(d =>
        d._link && (passada === 1 || d['Status do site'] === 'Não verificado')
      );

      for (let i = 0; i < pendentes.length && !parar; i++) {
        const d = pendentes[i];
        btn.textContent = `Lendo sites ${i + 1}/${pendentes.length} (passada ${passada})`;

        const info = await lerSiteETelefone(d._link, d['Empresa']);

        if (info && info.carregou) {
          let site = info.site || '';

          if (info.instagram) d['Instagram'] = info.instagram;
          if (info.bairro) d['Bairro'] = info.bairro;

          // Instagram e WhatsApp não são site: vão para a coluna certa
          if (/instagram\.com/i.test(site)) {
            d['Instagram'] = site;
            site = '';
          } else if (/wa\.me|api\.whatsapp|whatsapp\.com/i.test(site)) {
            site = '';
          }

          d['Link do site'] = site;
          d['Status do site'] = site ? 'Possui site' : 'Sem site';
          if (!d['Telefone'] && info.telefone) d['Telefone'] = info.telefone;
        }

        voltarParaLista();
        await sleep(1200);
      }
    }
  }

  // CSV com ponto e vírgula e BOM, para abrir certo no Excel do Brasil
  function toCSV(rows) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = rows.map(r => COLUNAS.map(c => esc(r[c])).join(';'));
    return '\uFEFF' + [COLUNAS.map(esc).join(';'), ...linhas].join('\r\n');
  }

  function download(texto) {
    const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empresas-gmaps-${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let extraindo = false;
  let parar = false;

  btn.addEventListener('click', async () => {
    // Se já está extraindo, o clique pede para parar
    if (extraindo) {
      parar = true;
      btn.textContent = 'Parando...';
      return;
    }

    // Se há uma empresa aberta no painel, volta para a lista primeiro
    if (!getFeed() && document.querySelector('button[aria-label="Voltar"], button[aria-label="Back"]')) {
      voltarParaLista();
      await sleep(1500);
    }

    if (!getFeed()) {
      alert('Faça uma busca no Google Maps antes de extrair.');
      return;
    }

    extraindo = true;
    parar = false;
    btn.textContent = 'Parar extração';
    btn.style.background = '#d93025';

    const results = new Map();
    await autoScroll(results);
    const linhas = ordenarEDeduplicar(results);
    await preencherSites(linhas);
    download(toCSV(linhas));

    extraindo = false;
    btn.textContent = `Extrair CSV (${linhas.length})`;
    btn.style.background = '#1a73e8';
  });
})();
