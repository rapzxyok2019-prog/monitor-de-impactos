// ============================================================
// SCRIPT DE COLETA DE NOTÍCIAS - COM RESUMO POR E-MAIL
// ============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');
const axios = require('axios');
const { Resend } = require('resend');

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 2;
const MIN_PALAVRAS_CHAVE = 2;

// ===== RESEND =====
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_123456789';
const resend = new Resend(RESEND_API_KEY);

// ===== E-MAIL =====
const EMAIL_REMETENTE = 'Resend <onboarding@resend.dev>';
const EMAIL_DESTINATARIOS = ['rapzxyok2019@gmial.com'];

// ===== PALAVRAS DE BLOQUEIO =====
const PALAVRAS_BLOQUEIO = [
  'política', 'político', 'eleição', 'voto', 'presidente', 'governo',
  'partido', 'senado', 'câmara', 'deputado', 'senador', 'vereador',
  'ministro', 'governador', 'inflação', 'ibovespa', 'dólar',
  'mercado financeiro', 'bolsa de valores', 'futebol', 'campeonato',
  'jogador', 'time', 'esporte', 'olimpíada', 'celebridade', 'famoso',
  'artista', 'novela', 'cinema', 'shows', 'safra', 'soja', 'milho',
  'trigo', 'café', 'agronegócio', 'plantio', 'colheita'
];

// ===== PALAVRAS FIXAS =====
const PALAVRAS_FIXAS = {
  clima: ['ciclone', 'ventania', 'tempestade', 'granizo', 'vendaval', 'tornado', 'furacão', 'chuva', 'enchente', 'alagamento', 'inundação', 'deslizamento'],
  policial: ['roubo', 'assalto', 'carga', 'criminalidade', 'violência', 'tiroteio', 'confronto', 'operação policial', 'prf', 'blitz', 'bandido', 'traficante', 'apreensão', 'flagrante', 'investigação', 'vigilância', 'segurança pública', 'carga roubada', 'incêndio', 'fogo', 'queimada', 'desaparece', 'desaparecido', 'espancado', 'agressão', 'morte', 'homicídio'],
  greve: ['greve', 'paralisação', 'caminhoneiro', 'bloqueio', 'protesto', 'piquete', 'manifestação', 'travamento'],
  acidente: ['acidente', 'colisão', 'capotamento', 'engavetamento', 'atropelamento', 'batida', 'tombamento'],
  transito: ['interdição', 'rodovia', 'br-', 'trânsito', 'congestionamento', 'desvio', 'obras'],
  fabrica: ['fábrica', 'produção', 'indústria', 'linha de produção', 'parada']
};

// ===== FONTES DE NOTÍCIAS =====
const FONTES = [
  { nome: 'G1 - Geral', url: 'https://g1.globo.com/rss/g1/', categoria: 'geral' },
  { nome: 'G1 - Segurança Pública', url: 'https://g1.globo.com/rss/g1/seguranca/', categoria: 'geral' },
  { nome: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', categoria: 'geral' },
  { nome: 'Folha de SP', url: 'https://feeds.folha.uol.com.br/folha/emcimadahora/rss091.xml', categoria: 'geral' },
  { nome: 'JP News', url: 'https://jovempan.com.br/feed', categoria: 'geral' },
  { nome: 'Agência Brasil - EBC', url: 'https://www.ebc.com.br/feed', categoria: 'geral' },
  { nome: 'R7 - Notícias', url: 'https://noticias.r7.com/feed.xml', categoria: 'geral' },
  { nome: 'R7 - Brasil', url: 'https://noticias.r7.com/brasil/feed.xml', categoria: 'geral' },
  { nome: 'Metrópoles - DF', url: 'https://www.metropoles.com/feed', categoria: 'geral' },
  { nome: 'Estadão - Geral', url: 'https://estadao.com.br/rss/geral.xml', categoria: 'geral' },
  { nome: 'Estadão - Polícia', url: 'https://estadao.com.br/rss/policia.xml', categoria: 'geral' },
  { nome: 'G1 - São Paulo', url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/', categoria: 'geral' },
  { nome: 'G1 - Rio de Janeiro', url: 'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/', categoria: 'geral' },
  { nome: 'G1 - Minas Gerais', url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/', categoria: 'geral' },
  { nome: 'G1 - Paraná', url: 'https://g1.globo.com/rss/g1/pr/parana/', categoria: 'geral' },
  { nome: 'G1 - Bahia', url: 'https://g1.globo.com/rss/g1/ba/bahia/', categoria: 'geral' },
  { nome: 'G1 - Pernambuco', url: 'https://g1.globo.com/rss/g1/pe/pernambuco/', categoria: 'geral' },
  { nome: 'G1 - Rio Grande do Sul', url: 'https://g1.globo.com/rss/g1/rs/rio-grande-do-sul/', categoria: 'geral' },
  { nome: 'G1 - Ceará', url: 'https://g1.globo.com/rss/g1/ce/ceara/', categoria: 'geral' },
  { nome: 'R7 - São Paulo', url: 'https://noticias.r7.com/sao-paulo/feed.xml', categoria: 'geral' },
  { nome: 'R7 - Rio de Janeiro', url: 'https://noticias.r7.com/rio-de-janeiro/feed.xml', categoria: 'geral' },
  { nome: 'O Globo - Rio', url: 'https://oglobo.globo.com/rss/rio/', categoria: 'geral' },
  { nome: 'O Globo - São Paulo', url: 'https://oglobo.globo.com/rss/sao-paulo/', categoria: 'geral' }
];

// ===== CARREGAR PALAVRAS-CHAVE =====
async function carregarPalavrasChave(db) {
  try {
    let doc = await db.collection('configurações').doc('geral').get();
    if (!doc.exists) {
      doc = await db.collection('configuracoes').doc('geral').get();
    }
    if (doc.exists) {
      const palavras = doc.data().palavrasChave || [];
      console.log('📋 Palavras-chave:', palavras.join(', '));
      return palavras;
    }
  } catch (e) {
    console.error(e);
  }
  return ['roubo', 'carga', 'assalto', 'greve', 'acidente', 'chuva', 'interdição', 'PRF', 'blitz', 'caminhoneiro'];
}

// ===== CARREGAR CATEGORIAS =====
async function carregarCategorias(db) {
  try {
    const snapshot = await db.collection('categorias').get();
    const categorias = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const nome = data.nome || doc.id;
      const palavrasFirestore = data.palavras || [];
      const palavrasFixas = PALAVRAS_FIXAS[nome] || [];
      const todasPalavras = [...new Set([...palavrasFirestore, ...palavrasFixas])];
      categorias.push({
        nome: nome,
        palavras: todasPalavras,
        prioridade: data.prioridade || 99
      });
    });
    categorias.sort((a, b) => a.prioridade - b.prioridade);
    console.log('📋 Categorias carregadas:', categorias.length);
    return categorias;
  } catch (error) {
    console.error('❌ Erro ao carregar categorias:', error);
    return [];
  }
}

// ===== RELEVÂNCIA =====
function isRelevante(titulo, resumo, palavrasChave) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  for (const bloqueio of PALAVRAS_BLOQUEIO) {
    if (texto.includes(bloqueio)) return false;
  }
  let count = 0;
  for (const palavra of palavrasChave) {
    if (texto.includes(palavra.toLowerCase())) count++;
  }
  return count >= MIN_PALAVRAS_CHAVE;
}

// ===== DETECTAR CATEGORIA =====
function detectarCategoria(titulo, resumo, categoriaFonte, categoriasFirestore) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  for (const cat of categoriasFirestore) {
    if (!cat.palavras || cat.palavras.length === 0) continue;
    for (const palavra of cat.palavras) {
      if (texto.includes(palavra.toLowerCase())) {
        console.log('  🔍 "' + cat.nome + '" → "' + palavra + '"');
        return cat.nome;
      }
    }
  }
  if (categoriaFonte && categoriaFonte !== 'geral') {
    console.log('  📌 Fallback:', categoriaFonte);
    return categoriaFonte;
  }
  console.log('  ⚠️ Nenhuma → "geral"');
  return 'geral';
}

// ===== ENVIAR RESUMO =====
async function enviarResumo(noticiasCriticas) {
  if (noticiasCriticas.length === 0) {
    console.log('📧 Nenhuma notícia crítica para enviar.');
    return;
  }

  const total = noticiasCriticas.length;
  const dataHora = new Date().toLocaleString('pt-BR');

  const contagemCategorias = {};
  for (const n of noticiasCriticas) {
    contagemCategorias[n.categoria] = (contagemCategorias[n.categoria] || 0) + 1;
  }

  let listaNoticias = '';
  for (const n of noticiasCriticas) {
    listaNoticias += `
      <div style="margin-bottom: 20px; padding: 12px; border-left: 4px solid #003da5; background: #f8f9fc; border-radius: 8px;">
        <h4 style="margin: 0 0 6px 0;">${n.titulo}</h4>
        <p style="margin: 4px 0; color: #4a5b76; font-size: 0.9rem;"><strong>Categoria:</strong> ${n.categoria}</p>
        <p style="margin: 4px 0; color: #4a5b76; font-size: 0.9rem;"><strong>Fonte:</strong> ${n.fonte}</p>
        <p style="margin: 6px 0;">${n.resumo}</p>
        <a href="${n.link}" target="_blank" style="color: #003da5;">🔗 Ver notícia original</a>
      </div>
    `;
  }

  const assunto = '📊 Monitor PepsiCo - ' + total + ' notícia(s) crítica(s) encontrada(s)';
  const mensagemHtml = `
    <h2 style="color: #003da5;">🚛 Monitor de Impactos - PepsiCo</h2>
    <p><strong>Data/Hora:</strong> ${dataHora}</p>
    <p><strong>Total de notícias críticas:</strong> ${total}</p>
    <div style="background: #eef2f6; padding: 12px; border-radius: 8px; margin: 12px 0;">
      <h4 style="margin: 0;">📊 Resumo por categoria</h4>
      <ul style="margin: 8px 0 0 0; padding-left: 20px;">
        ${Object.entries(contagemCategorias).map(([cat, qtd]) => `<li><strong>${cat}</strong>: ${qtd}</li>`).join('')}
      </ul>
    </div>
    <h3>📰 Notícias encontradas</h3>
    ${listaNoticias}
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e6ee;">
    <p style="color: #6b7a93; font-size: 0.8rem;">Enviado automaticamente pelo Monitor de Impactos.</p>
  `;

  try {
    for (const destinatario of EMAIL_DESTINATARIOS) {
      const { data, error } = await resend.emails.send({
        from: EMAIL_REMETENTE,
        to: [destinatario],
        subject: assunto,
        html: mensagemHtml
      });

      if (error) {
        console.error('  ❌ Erro ao enviar para ' + destinatario + ':', error.message);
      } else {
        console.log('  📧 Resumo enviado para ' + destinatario + ' (' + total + ' notícias)');
      }
    }
  } catch (error) {
    console.error('  ❌ Erro no envio:', error.message);
  }
}

// ===== EXTRAIR CIDADE =====
function extrairCidade(titulo, resumo) {
  const texto = titulo + ' ' + resumo;
  const cidades = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre', 'Curitiba', 'Brasília', 'Salvador', 'Fortaleza', 'Recife', 'Manaus', 'Belém', 'Goiânia', 'Campinas', 'Santos', 'Congonhas', 'Ribeirão Preto', 'São José dos Campos', 'Uberlândia', 'Contagem', 'Betim', 'Nova Lima', 'SP', 'RJ', 'MG', 'RS', 'PR', 'DF', 'BA', 'PE', 'CE'];
  for (const cidade of cidades) {
    if (texto.includes(cidade)) return cidade;
  }
  return null;
}

// ===== GEOCODIFICAR =====
async function geocodificar(cidade) {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: cidade + ', Brasil', format: 'json', limit: 1 },
      headers: { 'User-Agent': 'Monitor-Frotas-PepsiCo' }
    });
    if (response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon),
        cidade: response.data[0].display_name
      };
    }
  } catch (error) {
    console.log('⚠️ Erro ao geocodificar "' + cidade + '":', error.message);
  }
  return null;
}

// ===== EXPIRAÇÃO =====
function calcularDataExpiracao() {
  const agora = new Date();
  const expira = new Date(agora);
  expira.setDate(expira.getDate() + DIAS_PADRAO);
  return expira;
}

// ===== COLETAR =====
async function coletarNoticias() {
  console.log('📡 Iniciando coleta...');
  initializeApp();
  const db = getFirestore();
  const parser = new Parser();

  const palavrasChave = await carregarPalavrasChave(db);
  console.log('📋 Mínimo de ' + MIN_PALAVRAS_CHAVE + ' palavra(s)-chave obrigatória(s)');

  const categoriasFirestore = await carregarCategorias(db);

  let total = 0;
  const noticiasCriticas = [];

  for (const fonte of FONTES) {
    try {
      console.log('\n📡 ' + fonte.nome);
      const feed = await parser.parseURL(fonte.url);
      const noticias = [];

      for (const item of feed.items.slice(0, 8)) {
        const titulo = item.title || 'Sem título';
        const resumo = item.contentSnippet || item.description || 'Sem resumo';
        const link = item.link || '#';
        const dataPub = item.pubDate ? new Date(item.pubDate) : new Date();

        console.log('  📰 "' + titulo.slice(0, 40) + '..."');

        if (!isRelevante(titulo, resumo, palavrasChave)) {
          console.log('  ⏭️ Ignorado');
          continue;
        }

        const existing = await db.collection('noticias').where('link', '==', link).get();
        if (!existing.empty) {
          console.log('  ⏭️ Duplicada');
          continue;
        }

        const categoria = detectarCategoria(titulo, resumo, fonte.categoria, categoriasFirestore);
        const expiracao = calcularDataExpiracao();

        const cidade = extrairCidade(titulo, resumo);
        let localizacao = null;
        if (cidade) {
          localizacao = await geocodificar(cidade);
          if (localizacao) console.log('  📍 ' + cidade);
        }

        const texto = (titulo + ' ' + resumo).toLowerCase();
        const palavrasEncontradas = [];
        const criticas = ['roubo', 'carga', 'assalto', 'greve', 'acidente', 'interdição', 'enchente', 'PRF', 'blitz'];
        for (const palavra of criticas) {
          if (texto.includes(palavra)) palavrasEncontradas.push(palavra);
        }

        const noticia = {
          titulo: titulo,
          resumo: resumo,
          link: link,
          fonte: fonte.nome,
          categoria: categoria,
          dataPublicacao: dataPub,
          dataColeta: new Date(),
          dataExpiracao: expiracao,
          lidaPor: [],
          reacoes: { '👍': 0, '⚠️': 0, '🔥': 0 },
          palavrasChaveEncontradas: palavrasEncontradas.length > 0 ? palavrasEncontradas : ['geral'],
          localizacao: localizacao
        };

        noticias.push(noticia);
        console.log('  ✅ Salva: ' + categoria);

        const categoriasAlertas = ['policial', 'acidente', 'greve', 'clima'];
        if (categoriasAlertas.includes(categoria)) {
          noticiasCriticas.push(noticia);
        }
      }

      if (noticias.length > 0) {
        const batch = db.batch();
        for (const noticia of noticias) {
          const ref = db.collection('noticias').doc();
          batch.set(ref, noticia);
        }
        await batch.commit();
        console.log('  ✅ ' + noticias.length + ' notícias salvas');
        total += noticias.length;
      }
    } catch (error) {
      console.error('  ❌ Erro em ' + fonte.nome + ':', error.message);
    }
  }

  console.log('\n✅ Coleta finalizada! ' + total + ' novas notícias.');

  await enviarResumo(noticiasCriticas);

  return total;
}

coletarNoticias()
  .then(function() {
    process.exit(0);
  })
  .catch(function(error) {
    console.error('❌ Erro na coleta:', error);
    process.exit(1);
  });
