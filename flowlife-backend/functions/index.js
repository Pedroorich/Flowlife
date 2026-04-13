const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

// Inicializa o app do Firebase Admin para interagir com o Firestore
admin.initializeApp();
const db = admin.firestore();

// ==========================================
// FUNÇÃO AUXILIAR: Enviar Webhook
// ==========================================
async function sendWebhook(url, payload) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`Webhook enviado: ${url} | Status: ${response.status}`);
  } catch (error) {
    console.error(`Erro ao disparar webhook para ${url}:`, error);
  }
}

// ==========================================
// A) RESUMO MATINAL (08:00 AM)
// ==========================================
exports.resumoMatinal = functions.pubsub.schedule("0 8 * * *")
  .timeZone("America/Sao_Paulo")
  .onRun(async (context) => {
    console.log("Iniciando rotina: resumoMatinal");

    // Puxa todos os usuários com webhook preenchido
    const usersSnapshot = await db.collection("users").where("webhookUrl", "!=", "").get();

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id; // uid do usuário
      const webhookUrl = userData.webhookUrl;

      // Conta as tarefas pendentes do usuário
      const tasksSnapshot = await db.collection("tasks")
        .where("userId", "==", userId)
        .where("status", "==", "pending")
        .get();

      const totalPending = tasksSnapshot.size;

      // Dispara o Webhook
      await sendWebhook(webhookUrl, {
        evento: "resumoMatinal",
        totalPendentes: totalPending
      });
    }

    return null;
  });

// ==========================================
// B) FECHAMENTO DIÁRIO (18:00 PM)
// ==========================================
exports.fechamentoDiario = functions.pubsub.schedule("0 18 * * *")
  .timeZone("America/Sao_Paulo")
  .onRun(async (context) => {
    console.log("Iniciando rotina: fechamentoDiario");

    // Extrair data de hoje (YYYY-MM-DD) restrita ao fuso de SP
    const today = new Date();
    const spTimeObj = new Date(today.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const yyyy = spTimeObj.getFullYear();
    const mm = String(spTimeObj.getMonth() + 1).padStart(2, '0');
    const dd = String(spTimeObj.getDate()).padStart(2, '0');
    const dateFormatted = `${yyyy}-${mm}-${dd}`;

    const usersSnapshot = await db.collection("users").where("webhookUrl", "!=", "").get();

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const webhookUrl = userData.webhookUrl;

      // Conta tarefas completadas APENAS em dateAllocated == hoje
      const tasksSnapshot = await db.collection("tasks")
        .where("userId", "==", userId)
        .where("status", "==", "completed")
        .where("dateAllocated", "==", dateFormatted)
        .get();

      const totalCompleted = tasksSnapshot.size;

      // Dispara o Webhook
      await sendWebhook(webhookUrl, {
        evento: "fechamentoDiario",
        totalCompletadasHoje: totalCompleted,
        data: dateFormatted
      });
    }

    return null;
  });

// ==========================================
// C) ALERTA DE COMPROMISSOS (A cada 15 min)
// ==========================================
exports.alertaCompromissos = functions.pubsub.schedule("every 15 minutes")
  .timeZone("America/Sao_Paulo")
  .onRun(async (context) => {
    console.log("Iniciando rotina: alertaCompromissos");

    const now = new Date();
    // Adiciona 30 minutos a partir do momento atual
    const future = new Date(now.getTime() + 30 * 60000);

    const nowIso = now.toISOString();
    const futureIso = future.toISOString();

    const usersSnapshot = await db.collection("users").where("webhookUrl", "!=", "").get();

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const webhookUrl = userData.webhookUrl;

      // Busca na coleção tasks com isFixed == true (pendentes com startDate nas próximas 0-30 min)
      const tasksSnapshot = await db.collection("tasks")
        .where("userId", "==", userId)
        .where("status", "==", "pending")
        .where("isFixed", "==", true)
        .where("startDate", ">=", nowIso)
        .where("startDate", "<=", futureIso)
        .get();

      for (const taskDoc of tasksSnapshot.docs) {
        const taskData = taskDoc.data();

        // Dispara o Webhook
        await sendWebhook(webhookUrl, {
          evento: "alertaCompromisso",
          tarefaId: taskDoc.id,
          titulo: taskData.title || "Compromisso em breve!",
          startDate: taskData.startDate
        });
      }
    }

    return null;
  });

// ==========================================
// D) MONITORAMENTO DE ATIVIDADES (A cada 1 min)
// ==========================================
exports.monitorarAtividades = functions.pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    console.log("Iniciando rotina: monitorarAtividades");

    const now = Date.now();

    // Puxa usuários com dia ativo e alguma tarefa rodando
    const usersSnapshot = await db.collection("users")
      .where("dailyState.active", "==", true)
      .get();

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const state = userData.dailyState;
      const uid = userDoc.id;

      if (!state || !state.taskEndTime || !state.currentTaskId) continue;

      const taskEndTimeMs = new Date(state.taskEndTime).getTime();
      const msLeft = taskEndTimeMs - now;

      const updates = {};

      // 1. Faltando 5 minutos (ou menos) e ainda ativo
      if (msLeft <= 5 * 60000 && msLeft > 0) {
        if (!state.notified5Min && userData.webhookUrl5Min) {
          await sendWebhook(userData.webhookUrl5Min, {
            evento: "alertaFimBreve",
            tarefaId: state.currentTaskId,
            minutosRestantes: Math.ceil(msLeft / 60000)
          });
          updates["dailyState.notified5Min"] = true;
        }
      }

      // 2. Tempo finalizado
      if (msLeft <= 0) {
        if (!state.notifiedEnd && userData.webhookUrlEnd) {
          await sendWebhook(userData.webhookUrlEnd, {
            evento: "atividadeEncerrada",
            tarefaId: state.currentTaskId
          });
          updates["dailyState.notifiedEnd"] = true;
        }
      }

      // Salva updates no usuário, se houver
      if (Object.keys(updates).length > 0) {
        await db.collection("users").doc(uid).update(updates);
      }
    }

    return null;
  });
