// ============================================================
// MONITOR DE IMPACTOS - COLETOR OPERACIONAL v2.0
// ============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');
const axios = require('axios');
const { Resend } = require('resend');

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const DIAS_PADRAO = 2;

// Score mínimo para salvar uma notícia
const SCORE_MINIMO = 40;

// Score mínimo para entrar no alerta por e-mail
const SCORE_ALERTA = 70;

// Quantidade máxima de notícias por RSS
const MAX_NOTICIAS_POR_FONTE = 8;

// ============================================================
// RESEND
// ============================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY não configurada.');
}

const resend = new Resend(RESEND_API_KEY);

// ============================================================
// E-MAIL
// ============================================================

const EMAIL_REMETENTE = 'Resend <onboarding@resend.dev>';

const EMAIL_DESTINATARIOS = [
  'rapzxyok2019@gmail.com'
];

// ============================================================
// PALAVRAS DE BLOQUEIO
// ============================================================

const PALAVRAS_BLOQUEIO = [
  'eleição',
  'votação',
  'partido político',
  'deputado',
  'senador',
  'vereador',
  'celebridade',
  'famoso',
  'artista',
  'novela',
  'cinema',
  'filme',
  'série',
  'música',
  'cantor',
  'ator',
  'influenciador',
  'bbb',
  'reality show',
  'futebol',
  'campeonato',
  'jogador',
  'time',
  'olimpíada',
  'horóscopo',
  'moda',
  'fofoca',
  'receita',
  'entretenimento',
  'safra',
  'soja',
  'milho',
  'trigo',
  'café',
  'plantio',
  'colheita'
];

// ============================================================
// EVENTOS OPERACIONAIS
// ============================================================

const EVENTOS_OPERACIONAIS = {

  acidente: {
    palavras: [
      'acidente',
      'colisão',
      'capotamento',
      'engavetamento',
      'atropelamento',
      'batida',
      'tombamento',
      'carreta tombou',
      'caminhão tombou'
    ],
    peso: 25
  },

  transito: {
    palavras: [
      'interdição',
      'interditada',
      'interditado',
      'rodovia',
      'trânsito',
      'congestionamento',
      'lentidão',
      'desvio',
      'pista bloqueada',
      'pista interditada',
      'faixa bloqueada',
      'faixa interditada',
      'bloqueio'
    ],
    peso: 20
  },

  clima: {
    palavras: [
      'enchente',
      'alagamento',
      'alagamentos',
      'inundação',
      'deslizamento',
      'tempestade',
      'chuva intensa',
      'chuvas fortes',
      'chuva forte',
      'granizo',
      'vendaval',
      'ciclone',
      'tornado',
      'temporal'
    ],
    peso: 25
  },

  seguranca: {
    palavras: [
      'roubo de carga',
      'carga roubada',
      'assalto',
      'roubo',
      'furto de carga',
      'tiroteio',
      'confronto',
      'operação policial',
      'bloqueio policial',
      'perseguição',
      'crime organizado'
    ],
    peso: 20
  },

  greve: {
    palavras: [
      'greve',
      'paralisação',
      'paralisacao',
      'caminhoneiros',
      'manifestação',
      'manifestacao',
      'protesto',
      'piquete',
      'bloqueio de rodovia'
    ],
    peso: 25
  },

  infraestrutura: {
    palavras: [
      'falta de energia',
      'queda de energia',
      'apagão',
      'incêndio',
      'incendio',
      'explosão',
      'explosao',
      'vazamento',
      'queda de ponte',
      'ponte interditada'
    ],
    peso: 20
  },

  logistica: {
    palavras: [
      'transporte',
      'transportadora',
      'caminhão',
      'caminhoes',
      'caminhões',
      'carreta',
      'carga',
      'combustível',
      'abastecimento',
      'aeroporto',
      'porto',
      'centro de distribuição',
      'centro de distribuicao'
    ],
    peso: 10
  }

};

// ============================================================
// TERMOS DE IMPACTO
// ============================================================

const TERMOS_IMPACTO = [
  'interdição',
  'interditado',
  'interditada',
  'bloqueio',
  'bloqueada',
  'bloqueado',
  'evacuação',
  'evacuacao',
  'desvio',
  'congestionamento',
  'lentidão',
  'pista fechada',
  'pista interditada',
  'trânsito parado',
  'trânsito intenso',
  'sem acesso',
  'acesso bloqueado',
  'rota alternativa',
  'risco',
  'impacto',
  'paralisação',
  'paralisacao'
];

// ============================================================
// LOCALIDADES MONITORADAS
// ============================================================

const LOCALIDADES_MONITORADAS = [

  // São Paulo
  'são paulo',
  'campinas',
  'itu',
  'sorocaba',
  'jundiaí',
  'jundiai',
  'santos',
  'indaiatuba',
  'salto',
  'itupeva',
  'americana',
  'limeira',
  'piracicaba',
  'sumaré',
  'sumare',
  'hortolândia',
  'hortolandia',
  'guarulhos',
  'osasco',
  'barueri',
  'são bernardo do campo',
  'sao bernardo do campo',
  'santo andré',
  'santo andre',

  // Minas Gerais
  'belo horizonte',
  'contagem',
  'betim',
  'uberlândia',
  'uberlandia',
  'nova lima',

  // Paraná
  'curitiba',
  'são josé dos pinhais',
  'sao jose dos pinhais',

  // Rio de Janeiro
  'rio de janeiro',

  // Outras
  'porto alegre',
  'brasília',
  'brasilia'
];

// ============================================================
// RODOVIAS IMPORTANTES
// ============================================================

const RODOVIAS_MONITORADAS = [

  'castello branco',
  'castelo branco',
  'anhanguera',
  'bandeirantes',
  'raposo tavares',
  'régis bittencourt',
  'regis bittencourt',
  'fernão dias',
  'fernao dias',
  'presidente dutra',
  'dutra',
  'imigrantes',
  'anchieta',
  'rodoanel',
  'dom pedro',
  'washington luís',
  'washington luis',
  'marechal rondon',
  'carvalho pinto',
  'ayrton senna',
  'jacú pêssego',
  'jacu pessego'
];

// ============================================================
// FONTES
// ============================================================

const FONTES = [

  {
    nome: 'G1 - Segurança Pública',
    url: 'https://g1.globo.com/rss/g1/seguranca/',
    categoria: 'seguranca'
  },

  {
    nome: 'G1 - São Paulo',
    url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/',
    categoria: 'geral'
  },

  {
    nome: 'G1 - Minas Gerais',
    url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/',
    categoria: 'geral'
  },

  {
    nome: 'G1 - Paraná',
    url: 'https://g1.globo.com/rss/g1/pr/parana/',
    categoria: 'geral'
  },

  {
    nome: 'G1 - Rio de Janeiro',
    url: 'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/',
    categoria: 'geral'
  },

  {
    nome: 'CNN Brasil',
    url: 'https://www.cnnbrasil.com.br/feed/',
    categoria: 'geral'
  },

  {
    nome: 'R7 - São Paulo',
    url: 'https://noticias.r7.com/sao-paulo/feed.xml',
    categoria: 'geral'
  },

  {
    nome: 'R7 - Rio de Janeiro',
    url: 'https://noticias.r7.com/rio-de-janeiro/feed.xml',
    categoria: 'geral'
  },

  {
    nome: 'Estadão - Polícia',
    url: 'https://estadao.com.br/rss/policia.xml',
    categoria: 'seguranca'
  },

  {
    nome: 'O Globo - São Paulo',
    url: 'https://oglobo.globo.com/rss/sao-paulo/',
    categoria: 'geral'
  }

];

// ============================================================
// NORMALIZAÇÃO
// ============================================================

function normalizar(texto) {

  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

}

// ============================================================
// VERIFICAR PALAVRA
// ============================================================

function contem(texto, palavras) {

  return palavras.some(palavra =>
    texto.includes(normalizar(palavra))
  );

}

// ============================================================
// DETECTAR LOCAL
// ============================================================

function detectarLocalidade(titulo, resumo) {

  const texto = normalizar(`${titulo} ${resumo}`);

  for (const local of LOCALIDADES_MONITORADAS) {

    if (texto.includes(normalizar(local))) {
      return local;
    }

  }

  return null;

}

// ============================================================
// DETECTAR RODOVIA
// ============================================================

function detectarRodovia(titulo, resumo) {

  const texto = normalizar(`${titulo} ${resumo}`);

  for (const rodovia of RODOVIAS_MONITORADAS) {

    if (texto.includes(normalizar(rodovia))) {
      return rodovia;
    }

  }

  return null;

}

// ============================================================
// DETECTAR EVENTOS
// ============================================================

function detectarEventos(texto) {

  const eventos = [];

  for (const [categoria, config] of Object.entries(EVENTOS_OPERACIONAIS)) {

    const encontrou = config.palavras.some(palavra =>
      texto.includes(normalizar(palavra))
    );

    if (encontrou) {
      eventos.push(categoria);
    }

  }

  return eventos;

}

// ============================================================
// CALCULAR SCORE
// ============================================================

function calcularRelevancia(titulo, resumo, fonte) {

  const texto = normalizar(`${titulo} ${resumo}`);

  let score = 0;

  const motivos = [];

  // ----------------------------------------------------------
  // BLOQUEIOS
  // ----------------------------------------------------------

  for (const bloqueio of PALAVRAS_BLOQUEIO) {

    if (texto.includes(normalizar(bloqueio))) {

      score -= 50;

      motivos.push(`bloqueio: ${bloqueio}`);

      break;

    }

  }

  // ----------------------------------------------------------
  // EVENTOS
  // ----------------------------------------------------------

  const eventos = detectarEventos(texto);

  for (const evento of eventos) {

    const peso = EVENTOS_OPERACIONAIS[evento].peso;

    score += peso;

    motivos.push(evento);

  }

  // ----------------------------------------------------------
  // LOCALIDADE
  // ----------------------------------------------------------

  const localidade = detectarLocalidade(titulo, resumo);

  if (localidade) {

    score += 15;

    motivos.push(`localidade: ${localidade}`);

  }

  // ----------------------------------------------------------
  // RODOVIA
  // ----------------------------------------------------------

  const rodovia = detectarRodovia(titulo, resumo);

  if (rodovia) {

    score += 20;

    motivos.push(`rodovia: ${rodovia}`);

  }

  // ----------------------------------------------------------
  // IMPACTO OPERACIONAL
  // ----------------------------------------------------------

  if (contem(texto, TERMOS_IMPACTO)) {

    score += 20;

    motivos.push('impacto operacional');

  }

  // ----------------------------------------------------------
  // FONTE ESPECIALIZADA
  // ----------------------------------------------------------

  if (
    fonte.toLowerCase().includes('segurança') ||
    fonte.toLowerCase().includes('polícia')
  ) {

    score += 10;

    motivos.push('fonte especializada');

  }

  // ----------------------------------------------------------
  // LIMITE
  // ----------------------------------------------------------

  score = Math.max(0, Math.min(100, score));

  let nivel = 'DESCARTAR';

  if (score >= 85) {

    nivel = 'CRÍTICO';

  } else if (score >= 70) {

    nivel = 'ALTO';

  } else if (score >= 40) {

    nivel = 'MONITORAR';

  }

  return {

    score,
    nivel,
    eventos,
    localidade,
    rodovia,
    motivos

  };

}

// ============================================================
// CATEGORIA
// ============================================================

function determinarCategoria(analise) {

  if (analise.rodovia) return 'transito';

  if (analise.eventos.includes('acidente')) return 'acidente';

  if (analise.eventos.includes('clima')) return 'clima';

  if (analise.eventos.includes('greve')) return 'greve';

  if (analise.eventos.includes('seguranca')) return 'policial';

  if (analise.eventos.includes('infraestrutura')) return 'infraestrutura';

  if (analise.eventos.includes('logistica')) return 'logistica';

  if (analise.eventos.includes('transito')) return 'transito';

  return 'geral';

}

// ============================================================
// GEOCODIFICAÇÃO
// ============================================================

async function geocodificar(cidade) {

  try {

    const response = await axios.get(
      'https://nominatim.openstreetmap.org/search',
      {

        params: {

          q: `${cidade}, Brasil`,
          format: 'json',
          limit: 1

        },

        headers: {

          'User-Agent': 'Monitor-Impactos-Operacionais'

        }

      }
    );

    if (response.data.length > 0) {

      return {

        lat: parseFloat(response.data[0].lat),

        lng: parseFloat(response.data[0].lon),

        cidade: response.data[0].display_name

      };

    }

  } catch (error) {

    console.log(
      `⚠️ Erro ao geocodificar "${cidade}":`,
      error.message
    );

  }

  return null;

}

// ============================================================
// EXPIRAÇÃO
// ============================================================

function calcularDataExpiracao() {

  const agora = new Date();

  const expira = new Date(agora);

  expira.setDate(
    expira.getDate() + DIAS_PADRAO
  );

  return expira;

}

// ============================================================
// ENVIAR RESUMO POR E-MAIL (VERSÃO ENXUTA)
// ============================================================

async function enviarResumo(noticiasCriticas) {

  // Se não houver notícias críticas, não envia nada
  if (noticiasCriticas.length === 0) {
    console.log('📧 Nenhuma notícia de alto impacto.');
    return;
  }

  // Data/hora no fuso horário de Brasília
  const dataHora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });

  const total = noticiasCriticas.length;

  // Conta por categoria
  const contagemCategorias = {};
  for (const n of noticiasCriticas) {
    const cat = n.categoria || 'geral';
    contagemCategorias[cat] = (contagemCategorias[cat] || 0) + 1;
  }

  // Lista de categorias com emojis
  const emojis = {
    'acidente': '⚠️',
    'transito': '🚧',
    'clima': '🌧️',
    'policial': '🚔',
    'greve': '🚛',
    'infraestrutura': '🏗️',
    'logistica': '📦',
    'fabrica': '🏭',
    'geral': '📌'
  };

  let listaCategorias = '';
  for (const [cat, qtd] of Object.entries(contagemCategorias)) {
    const emoji = emojis[cat] || '📌';
    listaCategorias += `<li><strong>${emoji} ${cat}</strong>: ${qtd}</li>`;
  }

  // Link do site
  const linkSite = 'https://rapzxyok2019-prog.github.io/monitor-de-impactos/';

  const assunto = `🚨 ${total} alerta(s) operacional(is) - Monitor PepsiCo`;

  const mensagemHtml = `
    <h2 style="color:#003da5;">🚛 Monitor de Impactos - PepsiCo</h2>
    <p><strong>Data/Hora:</strong> ${dataHora}</p>
    <p style="font-size:1.3rem;"><strong>📊 Total de alertas:</strong> ${total}</p>
    <div style="background:#eef2f6; padding:12px; border-radius:8px; margin:12px 0;">
      <h4 style="margin:0;">📋 Resumo por categoria</h4>
      <ul style="margin:8px 0 0 0; padding-left:20px;">
        ${listaCategorias}
      </ul>
    </div>
    <p style="margin:16px 0;">
      <a href="${linkSite}" target="_blank" style="background:#003da5; color:white; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:bold;">
        🔍 Ver no Monitor
      </a>
    </p>
    <hr style="margin:24px 0; border:none; border-top:1px solid #e2e6ee;">
    <p style="color:#6b7a93; font-size:0.8rem;">Enviado automaticamente pelo Monitor de Impactos.</p>
  `;

  try {
    for (const destinatario of EMAIL_DESTINATARIOS) {
      const { error } = await resend.emails.send({
        from: EMAIL_REMETENTE,
        to: [destinatario],
        subject: assunto,
        html: mensagemHtml
      });

      if (error) {
        console.error(`❌ Erro ao enviar para ${destinatario}:`, error.message);
      } else {
        console.log(`📧 Alerta enviado para ${destinatario} (${total} notícias)`);
      }
    }
  } catch (error) {
    console.error('❌ Erro no envio:', error.message);
  }
}

// ============================================================
// COLETA
// ============================================================

async function coletarNoticias() {

  console.log(
    '📡 Iniciando Monitor de Impactos v2.0...'
  );

  initializeApp();

  const db = getFirestore();

  const parser = new Parser();

  let total = 0;

  const noticiasCriticas = [];

  // ==========================================================
  // FONTES
  // ==========================================================

  for (const fonte of FONTES) {

    try {

      console.log(`\n📡 ${fonte.nome}`);

      const feed =
        await parser.parseURL(fonte.url);

      const noticias = [];

      // ========================================================
      // NOTÍCIAS
      // ========================================================

      for (
        const item of feed.items.slice(
          0,
          MAX_NOTICIAS_POR_FONTE
        )
      ) {

        const titulo =
          item.title || 'Sem título';

        const resumo =
          item.contentSnippet ||
          item.description ||
          '';

        const link =
          item.link || '#';

        const dataPub =
          item.pubDate
            ? new Date(item.pubDate)
            : new Date();

        console.log(
          `📰 ${titulo.slice(0, 70)}`
        );

        // ======================================================
        // SCORE
        // ======================================================

        const analise =
          calcularRelevancia(
            titulo,
            resumo,
            fonte.nome
          );

        console.log(
          `   📊 Score: ${analise.score}/100`
        );

        console.log(
          `   🎯 Nível: ${analise.nivel}`
        );

        console.log(
          `   🔎 ${analise.motivos.join(', ')}`
        );

        // ======================================================
        // DESCARTAR
        // ======================================================

        if (
          analise.score <
          SCORE_MINIMO
        ) {

          console.log(
            '   ❌ DESCARTADA'
          );

          continue;

        }

        // ======================================================
        // DUPLICIDADE
        // ======================================================

        const existing =
          await db
            .collection('noticias')
            .where(
              'link',
              '==',
              link
            )
            .get();

        if (!existing.empty) {

          console.log(
            '   ⏭️ Duplicada'
          );

          continue;

        }

        // ======================================================
        // LOCALIZAÇÃO
        // ======================================================

        let localizacao = null;

        if (
          analise.localidade
        ) {

          localizacao =
            await geocodificar(
              analise.localidade
            );

        }

        // ======================================================
        // CATEGORIA
        // ======================================================

        const categoria =
          determinarCategoria(
            analise
          );

        // ======================================================
        // PALAVRAS ENCONTRADAS
        // ======================================================

        const palavrasEncontradas =
          analise.eventos;

        // ======================================================
        // OBJETO FINAL
        // ======================================================

        const noticia = {

          titulo,

          resumo,

          link,

          fonte: fonte.nome,

          categoria,

          dataPublicacao: dataPub,

          dataColeta: new Date(),

          dataExpiracao:
            calcularDataExpiracao(),

          scoreRelevancia:
            analise.score,

          nivelRelevancia:
            analise.nivel,

          eventosDetectados:
            analise.eventos,

          motivosRelevancia:
            analise.motivos,

          localidadeDetectada:
            analise.localidade,

          rodoviaDetectada:
            analise.rodovia,

          palavrasChaveEncontradas:
            palavrasEncontradas,

          lidaPor: [],

          reacoes: {

            '👍': 0,
            '⚠️': 0,
            '🔥': 0

          },

          localizacao

        };

        noticias.push(
          noticia
        );

        // ======================================================
        // ALERTA
        // ======================================================

        if (
          analise.score >=
          SCORE_ALERTA
        ) {

          noticiasCriticas.push(
            noticia
          );

        }

        console.log(
          `   ✅ SALVA — ${categoria}`
        );

      }

      // ========================================================
      // FIREBASE
      // ========================================================

      if (
        noticias.length > 0
      ) {

        const batch =
          db.batch();

        for (
          const noticia of noticias
        ) {

          const ref =
            db
              .collection('noticias')
              .doc();

          batch.set(
            ref,
            noticia
          );

        }

        await batch.commit();

        console.log(
          `   💾 ${noticias.length} notícia(s) salva(s)`
        );

        total +=
          noticias.length;

      }

    } catch (error) {

      console.error(
        `❌ Erro em ${fonte.nome}:`,
        error.message
      );

    }

  }

  // ==========================================================
  // FINAL
  // ==========================================================

  console.log(
    `\n✅ Coleta finalizada!`
  );

  console.log(
    `📰 ${total} novas notícias`
  );

  console.log(
    `🚨 ${noticiasCriticas.length} alerta(s)`
  );

  await enviarResumo(
    noticiasCriticas
  );

  return total;

}

// ============================================================
// EXECUTAR
// ============================================================

coletarNoticias()

  .then(() => {

    process.exit(0);

  })

  .catch(error => {

    console.error(
      '❌ Erro geral:',
      error
    );

    process.exit(1);

  });
