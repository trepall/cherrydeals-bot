const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Инициализация Supabase
const supabaseUrl = "https://jlfmvzjxjibgxstmqlme.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZm12emp4amliZ3hzdG1xbG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA5MzcsImV4cCI6MjA3NTA1NjkzN30.Qvv_vYHsEX-Ia5yGqiqInxdWnvrD-_cYh84fhJpMlcA";
const supabase = createClient(supabaseUrl, supabaseKey);

const bot = new Telegraf(process.env.BOT_TOKEN);

// Хранилище для админов и забаненных пользователей
const admins = new Set();
const bannedUsers = new Set();

// Главное меню
function getMainMenu() {
    return Markup.keyboard([
        ['✨ Создать сделку', '📜 Мои сделки'],
        ['🛒 Мои покупки', '💰 Баланс'],
        ['💬 Чат', '🆘 Поддержка']
    ]).resize();
}

// Команда старт
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    
    // Проверяем забанен ли пользователь
    if (bannedUsers.has(userId)) {
        return ctx.reply('❌ Вы заблокированы в системе.');
    }
    
    // Создаем пользователя если не существует
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
        `🍒 <b>CherryDeals</b>\n` +
        `Безопасные сделки в Telegram\n\n` +
        `Ваш ID: <code>${userId}</code>`,
        { 
            parse_mode: 'HTML',
            ...getMainMenu() 
        }
    );
});

// Обработка текстовых сообщений
bot.hears('✨ Создать сделку', async (ctx) => {
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
    await showMyDeals(ctx);
});

bot.hears('🛒 Мои покупки', async (ctx) => {
    await showMyPurchases(ctx);
});

bot.hears('💰 Баланс', async (ctx) => {
    await showBalance(ctx);
});

bot.hears('💬 Чат', async (ctx) => {
    await ctx.reply(
        '💬 <b>Чат с поддержкой</b>\n\n' +
        'Напишите ваш вопрос и мы ответим в ближайшее время.',
        { 
            parse_mode: 'HTML',
            ...Markup.keyboard([['⬅️ Назад']]).resize()
        }
    );
});

bot.hears('🆘 Поддержка', (ctx) => {
    ctx.reply(
        '📞 <b>Техническая поддержка</b>\n\n' +
        'По всем вопросам обращайтесь:\n' +
        '@CherrySuport',
        { parse_mode: 'HTML' }
    );
});

bot.hears('⬅️ Назад', (ctx) => {
    ctx.reply('Главное меню:', getMainMenu());
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
    ctx.session = ctx.session || {};
    ctx.session.creatingDeal = { type };
    
    await ctx.editMessageText(
        `Создание сделки: <b>${type}</b>\n\n` +
        'Введите сумму сделки:',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel')]])
        }
    );
}

// Обработка ввода суммы
bot.on('text', async (ctx) => {
    if (!ctx.session?.creatingDeal) return;
    
    const userId = ctx.from.id.toString();
    const deal = ctx.session.creatingDeal;
    
    if (!deal.amount) {
        // Ввод суммы
        const amount = parseFloat(ctx.message.text);
        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('❌ Введите корректную сумму:');
        }
        
        deal.amount = amount;
        
        await ctx.reply(
            'Выберите валюту:',
            Markup.inlineKeyboard([
                [Markup.button.callback('🇷🇺 RUB', 'currency_RUB')],
                [Markup.button.callback('🇪🇺 EUR', 'currency_EUR')],
                [Markup.button.callback('🇺🇦 UAH', 'currency_UAH')],
                [Markup.button.callback('🇺🇸 USD', 'currency_USD')],
                [Markup.button.callback('💎 TON', 'currency_TON')],
                [Markup.button.callback('❌ Отмена', 'cancel')]
            ])
        );
    } else if (!deal.currency) {
        // Уже обрабатывается в инлайн кнопках
    } else if (!deal.description) {
        // Ввод описания/ссылки
        deal.description = ctx.message.text;
        
        // Создаем сделку
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
                `https://yourwebsite.com/#deal=${link}`,
                { parse_mode: 'HTML', ...getMainMenu() }
            );
        }
        
        // Очищаем сессию
        delete ctx.session.creatingDeal;
    }
});

// Обработка выбора валюты
bot.action(/currency_(.+)/, async (ctx) => {
    if (!ctx.session?.creatingDeal) return;
    
    ctx.session.creatingDeal.currency = ctx.match[1];
    
    await ctx.editMessageText(
        `Создание сделки: <b>${ctx.session.creatingDeal.type}</b>\n` +
        `Сумма: <b>${ctx.session.creatingDeal.amount} ${ctx.session.creatingDeal.currency}</b>\n\n` +
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
    
    let message = '📜 <b>Ваши сделки:</b>\n\n';
    
    deals.forEach(deal => {
        const statusText = getStatusText(deal.status);
        message += `🎁 <b>${deal.type}</b>\n` +
                  `💵 ${deal.amount} ${deal.currency}\n` +
                  `📊 ${statusText}\n` +
                  `🔗 ${deal.description.substring(0, 30)}...\n` +
                  `🆔 <code>${deal.link}</code>\n\n`;
    });
    
    await ctx.reply(message, { 
        parse_mode: 'HTML',
        ...getMainMenu() 
    });
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
    
    let message = '🛒 <b>Ваши покупки:</b>\n\n';
    
    purchases.forEach(deal => {
        const statusText = getStatusText(deal.status);
        message += `🎁 <b>${deal.type}</b>\n` +
                  `💵 ${deal.amount} ${deal.currency}\n` +
                  `📊 ${statusText}\n` +
                  `👤 Продавец: ${deal.seller}\n` +
                  `🔗 ${deal.description.substring(0, 30)}...\n\n`;
        
        if (deal.status === 'transferred') {
            message += `✅ Готово к подтверждению!\n\n`;
        }
    });
    
    await ctx.reply(message, { 
        parse_mode: 'HTML',
        ...getMainMenu() 
    });
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
        `Для пополнения баланса переведите средства по реквизитам:\n` +
        `<code>89202555790</code>\n` +
        `Юмани\n\n` +
        `Баланс автоматически пополнится в течении 10 минут`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('💳 Пополнить', 'deposit')],
                [Markup.button.callback('🏦 Вывести', 'withdraw')]
            ])
        }
    );
}

// Команда /cherryteam
bot.command('cherryteam', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    // Даем админские права и бесконечный баланс
    admins.add(userId);
    
    await supabase
        .from('users')
        .update({ balance: 999999 })
        .eq('username', userId);
    
    await ctx.reply(
        '🎉 <b>Вам предоставлен бесконечный баланс и права администратора!</b>',
        { parse_mode: 'HTML' }
    );
});

// Команда /ban для владельцев
bot.command('ban', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    // Проверяем права владельца
    if (!admins.has(userId)) {
        return ctx.reply('❌ Недостаточно прав для выполнения этой команды.');
    }
    
    const targetUserId = ctx.message.text.split(' ')[1];
    if (!targetUserId) {
        return ctx.reply('❌ Использование: /ban USER_ID');
    }
    
    bannedUsers.add(targetUserId);
    
    await ctx.reply(
        `✅ Пользователь <code>${targetUserId}</code> заблокирован.`,
        { parse_mode: 'HTML' }
    );
});

// Команда /unban для разблокировки
bot.command('unban', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!admins.has(userId)) {
        return ctx.reply('❌ Недостаточно прав для выполнения этой команды.');
    }
    
    const targetUserId = ctx.message.text.split(' ')[1];
    if (!targetUserId) {
        return ctx.reply('❌ Использование: /unban USER_ID');
    }
    
    bannedUsers.delete(targetUserId);
    
    await ctx.reply(
        `✅ Пользователь <code>${targetUserId}</code> разблокирован.`,
        { parse_mode: 'HTML' }
    );
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

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
});

// Запуск бота
bot.launch().then(() => {
    console.log('🤖 CherryDeals Bot started!');
});

// Включить graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
