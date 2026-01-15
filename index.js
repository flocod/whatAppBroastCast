require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    SESSION_NAME: process.env.SESSION_NAME || 'nyamsi-connect',
    HEADLESS: process.env.HEADLESS !== 'false',

    ADMINS: (process.env.ADMIN_PHONES || '')
        .split(',')
        .map(num => num.replace(/\D/g, '')),

    TRIGGER_TAG: '@tous',

    // ⏱️ Délais humains
    MIN_DELAY: 12000,
    MAX_DELAY: 25000,

    // 🧠 Sécurité anti-ban
    MAX_MESSAGES_PER_SESSION: 120,
    LONG_PAUSE_EVERY: 25,
    LONG_PAUSE_MIN: 10 * 60 * 1000,
    LONG_PAUSE_MAX: 20 * 60 * 1000,

    // 🕒 Heures humaines
    ALLOWED_HOURS_START: 8,
    ALLOWED_HOURS_END: 22,

    SIGNATURE: '\n\n📢 _Envoyé par le Secrétariat Famille Nyamsi_'
};

// ============================================================================
// UTILITAIRES
// ============================================================================

const sleep = (min, max) =>
    new Promise(resolve =>
        setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
    );

function isAllowedHour() {
    const hour = new Date().getHours();
    return hour >= CONFIG.ALLOWED_HOURS_START &&
        hour < CONFIG.ALLOWED_HOURS_END;
}

function isAdmin(authorId, fromMe) {
    return authorId.includes("@lid") || fromMe;
}

function cleanMessage(text) {
    return text
        ?.replace(new RegExp(CONFIG.TRIGGER_TAG, 'ig'), '')
        .trim();
}

function formatBroadcastMessage(rawText) {
    return `*MESSAGE IMPORTANT DE LA FAMILLE* 🔔\n\n${cleanMessage(rawText)}${CONFIG.SIGNATURE}`;
}

function humanizeMessage(text) {
    const variants = ['🙏', '📌', '🔔', 'ℹ️', ''];
    const emoji = variants[Math.floor(Math.random() * variants.length)];
    return `${text}\n${emoji}`;
}

// ============================================================================
// ENVOI INDIVIDUEL
// ============================================================================

async function sendMessageToMember(client, memberId, type, messageData, text) {
    if (type === 'image') {
        const base64 = await client.downloadMedia(messageData);
        return client.sendImageFromBase64(memberId, base64, 'broadcast.jpg', text);
    }
    return client.sendText(memberId, text);
}

// ============================================================================
// LOGIQUE DE DIFFUSION
// ============================================================================

async function handleBroadcast(client, message) {
    const { from, author, body, caption, type, fromMe } = message;
    const textContent = type === 'image' ? caption : body;

    if (!textContent?.toLowerCase().includes(CONFIG.TRIGGER_TAG)) return;

    if (!isAdmin(author, fromMe)) {
        await client.sendText(author, '⛔ Commande réservée aux administrateurs.');
        return;
    }

    if (!isAllowedHour()) {
        await client.sendText(author, '⏰ Envoi autorisé uniquement entre 08h et 22h.');
        return;
    }

    const cleanContent = cleanMessage(textContent);
    if (!cleanContent || cleanContent.length < 3) {
        await client.sendText(author, '⚠️ Message trop court.');
        return;
    }

    const finalMessage = humanizeMessage(
        formatBroadcastMessage(textContent)
    );

    try {
        const participants = await client.getGroupMembersIds(from);
        const targets = participants.filter(p => p._serialized !== author);

        await client.sendText(
            author,
            `⏳ Diffusion en cours (${targets.length} destinataires maximum)`
        );

        let sent = 0;
        let failed = 0;

        for (let i = 0; i < targets.length; i++) {
            if (sent >= CONFIG.MAX_MESSAGES_PER_SESSION) break;

            const member = targets[i];

            try {
                await sendMessageToMember(
                    client,
                    member._serialized,
                    type,
                    message,
                    finalMessage
                );

                sent++;
                console.log(`✅ ${sent} envoyé → ${member.user}`);

                if (sent % CONFIG.LONG_PAUSE_EVERY === 0) {
                    const longPause =
                        Math.floor(Math.random() *
                            (CONFIG.LONG_PAUSE_MAX - CONFIG.LONG_PAUSE_MIN + 1)) +
                        CONFIG.LONG_PAUSE_MIN;

                    console.log(`😴 Pause longue ${Math.round(longPause / 60000)} min`);
                    await new Promise(r => setTimeout(r, longPause));
                } else {
                    await sleep(CONFIG.MIN_DELAY, CONFIG.MAX_DELAY);
                }

            } catch (err) {
                failed++;
                console.error(`❌ Échec ${member.user}`, err.message);
            }
        }

        await client.sendText(
            author,
            `✅ *Diffusion terminée*\n\n📨 Succès : ${sent}\n❌ Échecs : ${failed}`
        );

    } catch (err) {
        console.error('💥 Erreur diffusion:', err);
        await client.sendText(author, '❌ Erreur technique.');
    }
}

// ============================================================================
// DÉMARRAGE
// ============================================================================

async function start() {
    console.log('🚀 Nyamsi Connect démarré');

    const client = await wppconnect.create({
        session: CONFIG.SESSION_NAME,
        headless: CONFIG.HEADLESS,
        logQR: true,
        puppeteerOptions: {
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        },
        disableWelcome: true
    });

    client.onMessage(async message => {
        if (message.isGroupMsg) {
            await handleBroadcast(client, message);
        }
    });
}

start();














// require('dotenv').config();
// const wppconnect = require('@wppconnect-team/wppconnect');

// // ============================================================================
// // CONFIGURATION
// // ============================================================================
// const CONFIG = {
//     SESSION_NAME: process.env.SESSION_NAME || 'nyamsi-connect',
//     HEADLESS: process.env.HEADLESS !== 'false',
//     // Nettoyage automatique des numéros admins (enlève tout sauf les chiffres)
//     ADMINS: (process.env.ADMIN_PHONES || '').split(',').map(num => num.replace(/\D/g, '')),
//     TRIGGER_TAG: '@tous',
//     MIN_DELAY: 12000,
//     MAX_DELAY: 25000,
//     SIGNATURE: '\n\n📢 _Envoyé par le Secrétariat Famille Nyamsi_'
// };

// // ============================================================================
// // HELPER FUNCTIONS (UTILITAIRES)
// // ============================================================================

// const sleep = (min, max) => {
//     const ms = Math.floor(Math.random() * (max - min + 1) + min);
//     return new Promise(resolve => setTimeout(resolve, ms));
// };

// /**
//  * Vérifie si l'ID de l'auteur correspond à un admin.
//  * Utilise l'ID brut (ex: 237697511286) plutôt que le nom de contact.
//  */


// function nettoyerNumero(numero) {
//     // Le 'g' signifie "global" (remplacer toutes les occurrences)
//     // [ +] signifie "chercher les espaces OU le signe plus"
//     return numero.replace(/[ +]/g, "");
// }




// function isAdmin(authorId, fromMe) {
//     return authorId.includes("@lid") || fromMe;
// }

// function cleanMessage(text) {
//     if (!text) return "";
//     // Insensible à la casse pour le tag
//     return text.replace(new RegExp(CONFIG.TRIGGER_TAG, 'ig'), '').trim();
// }

// /**
//  * Prépare le contenu final du message
//  */
// function formatBroadcastMessage(rawText) {
//     const content = cleanMessage(rawText);
//     return `*MESSAGE IMPORTANT DE LA FAMILLE* 🔔\n\n${content}${CONFIG.SIGNATURE}`;
// }

// // ============================================================================
// // CORE LOGIC (CŒUR DU SYSTÈME)
// // ============================================================================

// /**
//  * Envoie un message unique (Texte ou Image) à un membre
//  */
// async function sendMessageToMember(client, memberId, type, messageData, caption) {
//     if (type === 'image') {
//         const base64 = await client.downloadMedia(messageData)
//         return await client.sendImageFromBase64(memberId, base64, 'broadcast.jpg', caption);
//     } else {
//         // On envoie du texte simple
//         return await client.sendText(memberId, caption);
//     }
// }

// /**
//  * Gère la logique de diffusion
//  */
// async function handleBroadcast(client, message) {
//     // 1. Extraction des infos de base
//     const { from: groupId, author, type, caption, body, from, fromMe } = message;

//     console.log("groupID:", groupId, "\nAuthor:", author, "\nMessageType:", type, "\ncaption:", caption, "\nbody:", body);

//     console.log('\nAuteur:', author);
//     console.log('\nFrom:', from);

//     // Contenu texte (soit le corps du message, soit la légende de l'image)
//     const textContent = type === 'image' ? caption : body;


//     const reelObjet = await client.getContact(author);

//     const reelNumber = reelObjet.formattedName;


//     // 2. Vérification rapide : est-ce une commande de broadcast ?
//     if (!textContent || !textContent.toLowerCase().includes(CONFIG.TRIGGER_TAG.toLowerCase())) {
//         return;
//     }

//     console.log(`\n🔔 Tentative de diffusion détectée dans ${groupId} par ${author}`);

//     // 3. Vérification Admin (Sécurité)
//     if (!isAdmin(author, fromMe)) {
//         console.log(`⛔ Refusé : ${reelNumber} n'est pas dans la liste ADMINS.`);
//         await client.sendText(author, `⚠️ Désolé ${reelNumber}, commande réservée aux administrateurs configurés.`);
//         return;
//     }

//     // 4. Validation du contenu
//     const cleanContent = cleanMessage(textContent);
//     if (cleanContent.length < 3) {
//         await client.sendText(author, "⚠️ Message trop court ou vide après nettoyage du tag.");
//         return;
//     }

//     const finalMessage = formatBroadcastMessage(textContent);

//     // 5. Récupération des membres
//     try {
//         const participants = await client.getGroupMembersIds(groupId);
//         // Filtrer l'auteur pour ne pas lui renvoyer le message
//         const targets = participants.filter(p => p._serialized !== author);

//         await client.sendText(author, `⏳ Diffusion validée. Envoi en cours vers ${targets.length} membres...`);

//         let successCount = 0;
//         let failCount = 0;

//         // 6. Boucle d'envoi unifiée
//         for (const member of targets) {
//             try {
//                 await sendMessageToMember(client, member._serialized, type, message, finalMessage);

//                 successCount++;
//                 console.log(`✅ [${successCount}/${targets.length}] Envoyé à ${member.user}`);

//                 // Pause anti-ban
//                 await sleep(CONFIG.MIN_DELAY, CONFIG.MAX_DELAY);

//             } catch (err) {
//                 console.error(`❌ Échec pour ${member.user}:`, err.message);
//                 failCount++;
//             }
//         }

//         // 7. Rapport final
//         await client.sendText(author, `✅ *Diffusion Terminée*\n\n📨 Succès : ${successCount}\n❌ Échecs : ${failCount}`);

//     } catch (err) {
//         console.error('Erreur critique lors de la diffusion:', err);
//         await client.sendText(author, "❌ Une erreur technique est survenue (voir logs serveur).");
//     }
// }

// // ============================================================================
// // MAIN (DÉMARRAGE)
// // ============================================================================

// async function start() {
//     console.log('🚀 Démarrage Famille Nyamsi Connect (Optimized)...');
//     console.log('👥 Admins (IDs):', CONFIG.ADMINS);

//     if (CONFIG.ADMINS.length === 0 || CONFIG.ADMINS[0] === '') {
//         console.warn('⚠️ ATTENTION: Aucun numéro administrateur configuré dans le .env !');
//     }

//     try {
//         const client = await wppconnect.create({
//             session: CONFIG.SESSION_NAME,
//             headless: CONFIG.HEADLESS,
//             logQR: true,
//             puppeteerOptions: {
//                 args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
//             },
//             // Optimisation pour éviter de télécharger trop de données inutiles
//             disableWelcome: true,
//         });

//         client.onMessage(async (message) => {
//             if (message.isGroupMsg) {
//                 await handleBroadcast(client, message);
//             }
//         });

//     } catch (err) {
//         console.error('💥 Erreur au lancement du client:', err);
//     }
// }

// start();

