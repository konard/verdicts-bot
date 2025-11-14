const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const state = {};

function getVerdict(facts) {
  let theft = facts.find(fact => fact.type === 'theft');
  let participants = facts.find(fact => fact.type === 'participants');
  let verdict = '';

  if (theft) {
    let damageValue = theft.damageValue;

    if (damageValue < 5000) {
      verdict = 'Подозреваемому может быть назначен штраф до 80 000 рублей, либо зарплата или другой доход за период до шести месяцев, ' +
      'либо обязательные работы на срок до 360 часов, либо исправительные работы до одного года, либо лишение свободы до двух лет.';
    } else if (damageValue >= 5000 && damageValue <= 250000) {
      verdict = 'Подозреваемому может быть назначен штраф до 200 000 рублей, или могут быть вынуждены работать до 5 лет, или заключён на срок до 5 лет.';
    } else if (damageValue > 250000 && damageValue <= 1000000) {
      verdict = 'Подозреваемому может быть назначен штраф до 500 000 рублей, либо может быть приговорен к тюремному заключению до 6 лет, с наложением штрафа до 80 000 рублей, или компенсация на период до 6 месяцев. ' +
      'и ограничение свободы на срок до полутора лет.';
    } else if (damageValue > 1000000) {
      verdict = 'Подозреваемый может быть приговорен к тюремному заключению на срок до десяти лет, либо штраф до одного миллиона рублей и ограничение свободы на срок до двух лет.';
    }
  }

  if (participants) {
    let participantCount = participants.count;
    let hasOrganizer = participants.hasOrganizer;

    if (participantCount <= 1) {
      verdict += '\nЭто индивидуальная ответственность.';
    } else if (participantCount > 1 && !hasOrganizer) {
      verdict += '\nЭто групповая ответственность.';
    } else if (participantCount > 1 && hasOrganizer) {
      verdict += '\nЭто ответственность организованной группы.';
    }
  }

  return verdict;
}


function start(token) {
  const bot = new TelegramBot(token, {
    polling: true,
    request: {
      agentOptions: {
        keepAlive: true,
        family: 4
      },
      url: "https://api.telegram.org"
    }
  });

  // Handle polling errors to prevent crashes
  bot.on('polling_error', (error) => {
    console.error('error: [polling_error]', JSON.stringify({
      code: error.code,
      message: error.message
    }));
  });

  bot.onText(/\/(re)?start/, (msg) => {
    const chatId = msg.chat.id;
    state[chatId] = {
      step: "theft",
      theft: {},
      participants: {},
    };
    bot.sendMessage(
      chatId,
      "Давайте определим ожидаемый вердикт по 158 статьей УК РФ. Сначала введите ущерб от кражи числом в рублях. Например: 3000"
    );
  });

  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const chatState = state[chatId];
  
    if (chatState?.step === "theft") {
      let damageValue = parseInt(text);
      if (isNaN(damageValue)) {
        bot.sendMessage(chatId, "Пожалуйста, введите число. Например: 3000");
      } else {
        chatState.theft.type = "theft";
        chatState.theft.damageValue = damageValue;
        chatState.step = "participants";
        bot.sendMessage(chatId, "Пожалуйста, введите количество участников числом. Например: 1");
      }
    } else if (chatState?.step === "participants") {
      let count = parseInt(text);
      if (isNaN(count)) {
        bot.sendMessage(chatId, "Пожалуйста, введите число. Например: 1");
      } else {
        chatState.participants.count = count;
        chatState.step = "hasOrganizer";
        bot.sendMessage(
          chatId,
          "У участников есть организатор?",
          {
            reply_markup: {
              inline_keyboard: [
                [ { text: "Да", callback_data: "Да" }, { text: "Нет", callback_data: "Нет" } ],
              ]
            }
          }
        );
      }
    }
  });

  bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const text = query.data;
    const chatState = state[chatId];

    if (chatState?.step === "hasOrganizer") {
      if (text == 'Да') {
        chatState.participants.hasOrganizer = true;
      } else if (text == 'Нет') {
        chatState.participants.hasOrganizer = false;
      } else {
        bot.sendMessage(chatId, "Пожалуйста, выберите ответ из предложенных: 'Да' или 'Нет'");
        return;
      }
  
      const verdict = getVerdict([chatState.theft, chatState.participants]);
      bot.sendMessage(chatId, `Вероятный вердикт на основе представленных фактов:\n\n${verdict}\n\nВведите команду /restart чтобы начать заново.`);
    };
  });
}

fs.readFile('token', 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    console.log("Make sure token file exists and contains Telegram Bot token");
    return;
  }
  start(data);
});

