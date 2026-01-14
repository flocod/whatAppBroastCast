require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    SESSION_NAME: process.env.SESSION_NAME || 'nyamsi-connect',
    HEADLESS: process.env.HEADLESS !== 'false',
    // Nettoyage automatique des numéros admins (enlève tout sauf les chiffres)
    ADMINS: (process.env.ADMIN_PHONES || '').split(',').map(num => num.replace(/\D/g, '')),
    TRIGGER_TAG: '@tous',
    MIN_DELAY: 2000,
    MAX_DELAY: 6000,
    SIGNATURE: '\n\n📢 _Envoyé par le Secrétariat Famille Nyamsi_'
};

// ============================================================================
// HELPER FUNCTIONS (UTILITAIRES)
// ============================================================================

const sleep = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Vérifie si l'ID de l'auteur correspond à un admin.
 * Utilise l'ID brut (ex: 237697511286) plutôt que le nom de contact.
 */


function nettoyerNumero(numero) {
    // Le 'g' signifie "global" (remplacer toutes les occurrences)
    // [ +] signifie "chercher les espaces OU le signe plus"
    return numero.replace(/[ +]/g, "");
}




function isAdmin(authorId) {
    return authorId.includes("@lid");
}
// function isAdmin(authorId) {
//     const cleanNumero = nettoyerNumero(authorId);
//     console.log("CONFIG.ADMINS.some(admin => admin.includes(cleanNumero));", CONFIG.ADMINS.some(admin => admin.includes(cleanNumero)))
//     return CONFIG.ADMINS.some(admin => admin.includes(cleanNumero));
// }

function cleanMessage(text) {
    if (!text) return "";
    // Insensible à la casse pour le tag
    return text.replace(new RegExp(CONFIG.TRIGGER_TAG, 'ig'), '').trim();
}

/**
 * Prépare le contenu final du message
 */
function formatBroadcastMessage(rawText) {
    const content = cleanMessage(rawText);
    return `*MESSAGE IMPORTANT DE LA FAMILLE* 🔔\n\n${content}${CONFIG.SIGNATURE}`;
}

// ============================================================================
// CORE LOGIC (CŒUR DU SYSTÈME)
// ============================================================================

/**
 * Envoie un message unique (Texte ou Image) à un membre
 */
async function sendMessageToMember(client, memberId, type, messageData, caption) {
    if (type === 'image') {
        const base64 = messageData.content || messageData.body;
        const mime = messageData.mimetype || 'image/jpeg';
        const dataUrl = `data:${mime};base64,${base64}`;
        // On envoie l'image
        return await client.sendFile(memberId, dataUrl, 'broadcast.jpg', caption);
    } else {
        // On envoie du texte simple
        return await client.sendText(memberId, caption);
    }
}

/**
 * Gère la logique de diffusion
 */
async function handleBroadcast(client, message) {
    // 1. Extraction des infos de base
    const { from: groupId, author, type, caption, body, from } = message;

    console.log("groupID:", groupId, "\nAuthor:", author, "\nMessageType:", type, "\ncaption:", caption, "\nbody:", body);

    console.log('\nAuteur:', author);
    console.log('\nFrom:', from);

    // Contenu texte (soit le corps du message, soit la légende de l'image)
    const textContent = type === 'image' ? caption : body;


    const reelObjet = await client.getContact(author);

    const reelNumber = reelObjet.formattedName;


    // 2. Vérification rapide : est-ce une commande de broadcast ?
    if (!textContent || !textContent.toLowerCase().includes(CONFIG.TRIGGER_TAG.toLowerCase())) {
        return;
    }

    console.log(`\n🔔 Tentative de diffusion détectée dans ${groupId} par ${author}`);

    // 3. Vérification Admin (Sécurité)
    if (!isAdmin(author) || !CONFIG.ADMINS.includes(reelNumber)) {
        console.log(`⛔ Refusé : ${reelNumber} n'est pas dans la liste ADMINS.`);
        await client.sendText(author, `⚠️ Désolé ${reelNumber}, commande réservée aux administrateurs configurés.`);
        return;
    }

    // 4. Validation du contenu
    const cleanContent = cleanMessage(textContent);
    if (cleanContent.length < 3) {
        await client.sendText(author, "⚠️ Message trop court ou vide après nettoyage du tag.");
        return;
    }

    const finalMessage = formatBroadcastMessage(textContent);

    // 5. Récupération des membres
    try {
        const participants = await client.getGroupMembersIds(groupId);
        // Filtrer l'auteur pour ne pas lui renvoyer le message
        const targets = participants.filter(p => p._serialized !== author);

        await client.sendText(author, `⏳ Diffusion validée. Envoi en cours vers ${targets.length} membres...`);

        let successCount = 0;
        let failCount = 0;

        // 6. Boucle d'envoi unifiée
        for (const member of targets) {
            try {
                await sendMessageToMember(client, member._serialized, type, message, finalMessage);

                successCount++;
                console.log(`✅ [${successCount}/${targets.length}] Envoyé à ${member.user}`);

                // Pause anti-ban
                await sleep(CONFIG.MIN_DELAY, CONFIG.MAX_DELAY);

            } catch (err) {
                console.error(`❌ Échec pour ${member.user}:`, err.message);
                failCount++;
            }
        }

        // 7. Rapport final
        await client.sendText(author, `✅ *Diffusion Terminée*\n\n📨 Succès : ${successCount}\n❌ Échecs : ${failCount}`);

    } catch (err) {
        console.error('Erreur critique lors de la diffusion:', err);
        await client.sendText(author, "❌ Une erreur technique est survenue (voir logs serveur).");
    }
}

// ============================================================================
// MAIN (DÉMARRAGE)
// ============================================================================

async function start() {
    console.log('🚀 Démarrage Famille Nyamsi Connect (Optimized)...');
    console.log('👥 Admins (IDs):', CONFIG.ADMINS);

    if (CONFIG.ADMINS.length === 0 || CONFIG.ADMINS[0] === '') {
        console.warn('⚠️ ATTENTION: Aucun numéro administrateur configuré dans le .env !');
    }

    try {
        const client = await wppconnect.create({
            session: CONFIG.SESSION_NAME,
            headless: CONFIG.HEADLESS,
            logQR: true,
            puppeteerOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            },
            // Optimisation pour éviter de télécharger trop de données inutiles
            disableWelcome: true,
        });

        client.onMessage(async (message) => {
            if (message.isGroupMsg) {
                await handleBroadcast(client, message);
            }
        });

    } catch (err) {
        console.error('💥 Erreur au lancement du client:', err);
    }
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
//     // Liste des numéros autorisés à faire des annonces (Format: 237xxxxxx@c.us)
//     ADMINS: (process.env.ADMIN_PHONES || '').split(','),
//     // Tag déclencheur
//     TRIGGER_TAG: '@tous',
//     // Délais pour éviter le ban WhatsApp (en millisecondes)
//     MIN_DELAY: 2000, // 2 secondes min
//     MAX_DELAY: 6000, // 6 secondes max
//     SIGNATURE: '\n\n📢 _Envoyé par le Secrétariat Famille Nyamsi_'
// };

// // ============================================================================
// // HELPER FUNCTIONS
// // ============================================================================

// /**
//  * Génère un délai aléatoire pour simuler un comportement humain
//  * et éviter le blocage par WhatsApp.
//  */
// const sleep = (min, max) => {
//     const ms = Math.floor(Math.random() * (max - min + 1) + min);
//     return new Promise(resolve => setTimeout(resolve, ms));
// };

// /**
//  * Vérifie si l'expéditeur est un administrateur autorisé
//  */


// function nettoyerNumero(numero) {
//     // Le 'g' signifie "global" (remplacer toutes les occurrences)
//     // [ +] signifie "chercher les espaces OU le signe plus"
//     return numero.replace(/[ +]/g, "");
// }
// function isAdmin(numero) {
//     // On nettoie l'ID pour gérer les formats complexes parfois renvoyés
//     const cleanNumero = nettoyerNumero(numero);
//     console.log("CONFIG.ADMINS.some(admin => admin.includes(cleanNumero));", CONFIG.ADMINS.some(admin => admin.includes(cleanNumero)))
//     return CONFIG.ADMINS.some(admin => admin.includes(cleanNumero));
// }

// /**
//  * Nettoie le message (enlève le tag @tous)
//  */
// function cleanMessage(text) {
//     return text.replace(CONFIG.TRIGGER_TAG, '').trim();
// }


// const removeUser = (array, idToRemove) => {
//     return array.filter(item => item._serialized !== idToRemove);
// };


// // ============================================================================
// // LOGIQUE DE DIFFUSION (BROADCAST)
// // ============================================================================

// async function handleBroadcast(client, message) {
//     const chatId = message.from; // ID du groupe
//     const author = message.author;
//     const from = message.from;
//     const groupId = message.to;
//     const senderId = message.author // Qui a écrit (dans un groupe, c'est 'author')
//     const reelObjet = await client.getContact(author);
//     // console.log("reelObjet", reelObjet)
//     // console.log("message-------", message)
//     const reelNumber = reelObjet.formattedName;
//     const body = message.body || '';

//     console.log('\n==============================');
//     console.log('Auteur:', author);
//     console.log('From:', from);

//     // console.log(`\n📩 Message reçu de ${senderId} dans ${chatId}: ${body}`);
//     console.log('Contact senderId', reelNumber);

//     console.log("message=================>", message);

//     console.log(`\n🔔 Tentative de diffusion détectée dans ${chatId}`);

//     // 2. Vérification des droits (Sécurité)
//     if (!isAdmin(reelNumber)) {
//         console.log(`⛔ Refusé : ${reelNumber} n'est pas admin.`);
//         await client.sendText(author, `⚠️ Désolé, seul le Chef de Famille ou les admins peuvent utiliser la commande ${CONFIG.TRIGGER_TAG}.`);
//         return;
//     }


//     //     {
//     //     caption?: string;
//     //     createChat?: boolean;
//     //     delay?: number;
//     //     detectMentioned?: boolean;
//     //     filename?: string;
//     //     footer?: string;
//     //     markIsRead?: boolean;
//     //     mentionedList?: (string | WAJS.whatsapp.Wid)[];
//     //     messageId?: string | MsgKey;
//     //     mimetype?: string;
//     //     quotedMsg?: string | MsgKey | MsgModel;
//     //     quotedMsgPayload?: string;
//     //     type?: string;
//     //     waitForAck?: boolean;
//     // }

//     // 1. Vérification du Tag
//     if (message.type === 'image' && message.caption && message.caption.toLowerCase().includes(CONFIG.TRIGGER_TAG.toLowerCase())) {
//         //is image

//         console.log("C'est une image--------------------------------");
//         console.log("C'est un admin");
//         // console.log("CLIENT", client);

//         // 3. Préparation du message
//         const messageContent = cleanMessage(message.caption);
//         // if (messageContent.length < 4) {
//         //     await client.sendText(author, "⚠️ Le message est trop court pour être diffusé.");
//         //     return;
//         // }

//         const finalMessage = `*MESSAGE IMPORTANT DE LA FAMILLE* 🔔\n\n${messageContent}${CONFIG.SIGNATURE}`;

//         // 4. Récupération des membres du groupe
//         try {
//             console.log("groupe Id", from)
//             const participants = await client.getGroupMembersIds(from);

//             // console.log("Liste des participants================================>")
//             // console.log(participants)

//             const totalMembers = removeUser(participants, author); // -1 pour exclure le bot lui-même souvent
//             await client.sendText(author, `⏳ Diffusion en cours vers ${totalMembers.length} membres... Veuillez patienter.`);

//             let successCount = 0;
//             let failCount = 0;

//             // 5. Boucle d'envoi (La partie critique)
//             for (const member of participants) {

//                 try {

//                     // await client.sendFile(member._serialized, message.body, {
//                     //     caption: finalMessage
//                     // });





//                     // const base64Image = message.body;

//                     // // Pour l'afficher dans une balise HTML <img>
//                     // const imgSrc = `data:${message.mimetype};base64,${base64Image}`;

//                     // client.sendFile(member._serialized, imgSrc, {
//                     //     caption: finalMessage,
//                     // });












//                     const base64 = message.content || message.body;
//                     // la chaîne base64 brute
//                     const dataUrl = `data:${message.mimetype || 'image/jpeg'};base64,${base64}`;
//                     await client.sendFile(member._serialized, dataUrl, 'photo.jpg', finalMessage || '');














//                     successCount++;
//                     console.log(`✅ Envoyé à ${member.user}`);

//                     // PAUSE OBLIGATOIRE ANTI-SPAM
//                     await sleep(CONFIG.MIN_DELAY, CONFIG.MAX_DELAY);

//                 } catch (err) {
//                     console.error(`❌ Échec pour ${member.user}:`, err.message);
//                     failCount++;
//                 }
//             }

//             // 6. Rapport final dans le groupe
//             await client.sendText(author, `✅ *Diffusion Terminée*\n\n📨 Envoyés : ${successCount}\n❌ Échecs : ${failCount}`);

//         } catch (err) {
//             console.error('Erreur lors de la récupération des membres:', err);
//             await client.sendText(author, "❌ Une erreur technique est survenue lors de la récupération des membres.");
//         }




//     } else if (body.toLowerCase().includes(CONFIG.TRIGGER_TAG.toLowerCase())) {
//         //is text

//         console.log("C'est un admin")
//         // console.log("CLIENT", client);

//         // 3. Préparation du message
//         const messageContent = cleanMessage(body);
//         if (messageContent.length < 4) {
//             await client.sendText(author, "⚠️ Le message est trop court pour être diffusé.");
//             return;
//         }

//         const finalMessage = `*MESSAGE IMPORTANT DE LA FAMILLE* 🔔\n\n${messageContent}${CONFIG.SIGNATURE}`;

//         // 4. Récupération des membres du groupe
//         try {
//             console.log("groupe Id", from)
//             const participants = await client.getGroupMembersIds(from);

//             // console.log("Liste des participants================================>")
//             // console.log(participants)

//             const totalMembers = removeUser(participants, author); // -1 pour exclure le bot lui-même souvent

//             await client.sendText(author, `⏳ Diffusion en cours vers ${totalMembers.length} membres... Veuillez patienter.`);

//             let successCount = 0;
//             let failCount = 0;

//             // 5. Boucle d'envoi (La partie critique)
//             for (const member of participants) {

//                 try {

//                     await client.sendText(member._serialized, finalMessage);
//                     successCount++;
//                     console.log(`✅ Envoyé à ${member.user}`);

//                     // PAUSE OBLIGATOIRE ANTI-SPAM
//                     await sleep(CONFIG.MIN_DELAY, CONFIG.MAX_DELAY);

//                 } catch (err) {
//                     console.error(`❌ Échec pour ${member.user}:`, err.message);
//                     failCount++;
//                 }
//             }

//             // 6. Rapport final dans le groupe
//             await client.sendText(author, `✅ *Diffusion Terminée*\n\n📨 Envoyés : ${successCount}\n❌ Échecs : ${failCount}`);

//         } catch (err) {
//             console.error('Erreur lors de la récupération des membres:', err);
//             await client.sendText(author, "❌ Une erreur technique est survenue lors de la récupération des membres.");
//         }

//     } else {
//         return;
//     }
// }

// // ============================================================================
// // MAIN HANDLER
// // ============================================================================

// async function start() {
//     console.log('🚀 Démarrage Famille Nyamsi Connect...');
//     console.log('👥 Admins configurés:', CONFIG.ADMINS);

//     const client = await wppconnect.create({
//         session: CONFIG.SESSION_NAME,
//         headless: CONFIG.HEADLESS,
//         logQR: true,
//         puppeteerOptions: {
//             args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
//         },
//     });

//     // Écoute de tous les messages
//     client.onMessage(async (message) => {
//         // On ne traite que les messages de groupe pour la diffusion
//         if (message.isGroupMsg) {
//             await handleBroadcast(client, message);
//         }

//         // Ici, tu pourrais ajouter ton code Gemini "Assistant"
//         // si quelqu'un répond en privé au bot (Ex: "Merci", "C'est noté")
//         // pour éviter que le bot ne reste muet en privé.
//     });
// }

// start().catch((err) => {
//     console.error('💥 Erreur fatale:', err);
// });