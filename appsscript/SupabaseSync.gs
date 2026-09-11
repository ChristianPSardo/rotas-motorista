/**
 * Sincronização Google Sheets <-> Supabase para o sistema Rotas Motorista.
 *
 * Configure o segredo uma vez em Script Properties usando configurarSupabaseSync().
 * O GPS ao vivo do desktop usa getLiveTrackingData() e NÃO depende do gatilho de 1 minuto.
 */

const SB_SYNC_PUSH_URL = 'https://myrmbhrvhqrqtnkkazzr.supabase.co/functions/v1/admin-sync';
const SB_SYNC_PULL_URL = 'https://myrmbhrvhqrqtnkkazzr.supabase.co/functions/v1/admin-pull';
const SB_LIVE_URL = 'https://myrmbhrvhqrqtnkkazzr.supabase.co/functions/v1/admin-live';

function configurarSupabaseSync(segredo) {
  if (!segredo) throw new Error('Informe o segredo de sincronização.');
  PropertiesService.getScriptProperties().setProperty('SUPABASE_SYNC_SECRET', String(segredo).trim());
  return 'Supabase configurado.';
}

function sbSs_() {
  if (typeof ss_ === 'function') return ss_();

  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    props.setProperty('SPREADSHEET_ID', ss.getId());
    return ss;
  }

  throw new Error('Planilha não encontrada. Configure SPREADSHEET_ID nas propriedades do script.');
}

function sincronizarSupabase() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return 'Sincronização já em andamento.';

  try {
    const payload = {
      addresses: sbLerAba_('ENDERECOS'),
      drivers: sbLerAba_('MOTORISTAS'),
      routes: sbLerAba_('ROTAS'),
      stops: sbLerAba_('ROTA_PARADAS')
    };

    const push = sbPost_(SB_SYNC_PUSH_URL, payload);
    const pull = sbPost_(SB_SYNC_PULL_URL, {});

    if (pull && pull.data) {
      sbAplicarRotas_(pull.data.routes || []);
      sbAplicarParadas_(pull.data.stops || []);
      sbAplicarLocalizacoes_(pull.data.locations || []);
    }

    return {
      ok: true,
      enviados: push.synced || {},
      recebidos: {
        rotas: ((pull.data && pull.data.routes) || []).length,
        paradas: ((pull.data && pull.data.stops) || []).length,
        localizacoes: ((pull.data && pull.data.locations) || []).length
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function getLiveTrackingData(routeExternalId) {
  const body = {};
  if (routeExternalId) body.routeExternalId = String(routeExternalId);
  const result = sbPost_(SB_LIVE_URL, body);
  return result.data || { rotas: [] };
}

function ativarSincronizacaoAutomatica() {
  desativarSincronizacaoAutomatica();
  ScriptApp.newTrigger('sincronizarSupabase')
    .timeBased()
    .everyMinutes(1)
    .create();
  return 'Sincronização automática ativada a cada 1 minuto.';
}

function desativarSincronizacaoAutomatica() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarSupabase') {
      ScriptApp.deleteTrigger(t);
    }
  });
  return 'Triggers de sincronização removidos.';
}

function sbPost_(url, body) {
  const secret = PropertiesService.getScriptProperties().getProperty('SUPABASE_SYNC_SECRET');
  if (!secret) {
    throw new Error('SUPABASE_SYNC_SECRET não configurado. Execute configurarSupabaseSync().');
  }

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': secret },
    payload: JSON.stringify(body || {}),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('Resposta inválida do Supabase. HTTP ' + code + ': ' + text.slice(0, 300));
  }

  if (code < 200 || code >= 300 || !json.ok) {
    throw new Error((json && json.error) || ('Erro HTTP ' + code));
  }
  return json;
}

function sbLerAba_(nome) {
  const sh = sbSs_().getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return [];

  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const headers = values.shift().map(String);

  return values
    .filter(function(row) { return row.some(function(v) { return v !== '' && v !== null; }); })
    .map(function(row) {
      const obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
}

function sbAplicarRotas_(rows) {
  const sh = sbSs_().getSheetByName('ROTAS');
  if (!sh || !rows.length) return;
  sbAtualizarPorId_(sh, rows, ['STATUS', 'PARTIDA_PREVISTA', 'TEMPO_RESTANTE_MIN', 'ETA_FIM', 'ATUALIZADO_EM']);
}

function sbAplicarParadas_(rows) {
  const sh = sbSs_().getSheetByName('ROTA_PARADAS');
  if (!sh || !rows.length) return;
  sbAtualizarPorId_(sh, rows, ['STATUS', 'CHEGADA_REAL', 'CHECK_EM', 'ETA_PREVISTA']);
}

function sbAtualizarPorId_(sh, rows, campos) {
  const data = sh.getDataRange().getValues();
  if (!data.length) return;

  const headers = data[0].map(String);
  const idCol = headers.indexOf('ID');
  if (idCol < 0) return;

  const index = {};
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][idCol] || '');
    if (id) index[id] = r + 1;
  }

  rows.forEach(function(obj) {
    const rowNumber = index[String(obj.ID || '')];
    if (!rowNumber) return;

    campos.forEach(function(campo) {
      const col = headers.indexOf(campo);
      if (col < 0 || obj[campo] === undefined) return;

      let value = obj[campo];
      if (value && /(_EM|PREVISTA|REAL|ETA_FIM)$/.test(campo)) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) value = d;
      }
      sh.getRange(rowNumber, col + 1).setValue(value === null ? '' : value);
    });
  });
}

function sbAplicarLocalizacoes_(rows) {
  const ss = sbSs_();
  let sh = ss.getSheetByName('LOCALIZACOES');

  const headers = [
    'ID', 'ROTA_ID', 'MOTORISTA_ID', 'LAT', 'LNG',
    'PRECISAO_M', 'VELOCIDADE_MS', 'DIRECAO_GRAUS', 'ATUALIZADO_EM'
  ];

  if (!sh) {
    sh = ss.insertSheet('LOCALIZACOES');
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }

  const existing = sh.getDataRange().getValues();
  const h = existing.length ? existing[0].map(String) : headers;
  const routeCol = h.indexOf('ROTA_ID');
  const driverCol = h.indexOf('MOTORISTA_ID');
  const map = {};

  for (let r = 1; r < existing.length; r++) {
    const key = String(existing[r][routeCol] || '') + '|' + String(existing[r][driverCol] || '');
    if (key !== '|') map[key] = r + 1;
  }

  rows.forEach(function(loc) {
    if (!loc.ROTA_ID || !loc.MOTORISTA_ID) return;

    const key = String(loc.ROTA_ID) + '|' + String(loc.MOTORISTA_ID);
    const row = [
      key,
      loc.ROTA_ID,
      loc.MOTORISTA_ID,
      loc.LAT,
      loc.LNG,
      loc.PRECISAO_M,
      loc.VELOCIDADE_MS,
      loc.DIRECAO_GRAUS,
      loc.ATUALIZADO_EM ? new Date(loc.ATUALIZADO_EM) : new Date()
    ];

    const rowNumber = map[key];
    if (rowNumber) {
      sh.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
      map[key] = sh.getLastRow();
    }
  });
}

function testarSupabaseLive() {
  const data = getLiveTrackingData();
  Logger.log(JSON.stringify({
    rotas: (data.rotas || []).length,
    primeiraRota: data.rotas && data.rotas[0] ? data.rotas[0].NOME : null,
    gps: data.rotas && data.rotas[0] ? data.rotas[0].LOCALIZACAO : null
  }));
  return data;
}
