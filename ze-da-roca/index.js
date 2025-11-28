const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js'); 
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const googleTTS = require('google-tts-api');

require('dotenv').config()

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// chamada do modelo de gemini-1.5-flash pela api
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });


async function getGeminiResponse(messageBody, mediaFile) {
    let promptParts = [];

    if (mediaFile) {
        promptParts.push({
            inlineData: {
                mimeType: mediaFile.mimetype,
                data: mediaFile.data
            }
        });
    }

    if (messageBody) {
        promptParts.push({ text: messageBody });
    }

    if (promptParts.length === 0) return null;

    promptParts.push({ text: `\n\n[SISTEMA] Atue como 'Zé da Roça', assistente rural prático.
        - ÁUDIO/IMAGEM: Analise e responda diretamente.
        - DÚVIDAS: Use linguagem simples do campo. SEJA BREVE. Máximo de 3 frases se possível.
        - REGISTROS: Apenas confirme os dados principais (item, valor, quantidade).
        IMPORTANTE: Suas respostas devem ser CURTAS, ideais para leitura rápida no WhatsApp. (mas se for solicitado, pode enviar respostas mais longas)` });

    console.log("Zé da Roça pensando...");
    const result = await model.generateContent(promptParts);
    const response = result.response;
    return response.text();
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu']
    }
});

client.on('qr', (qr) => {
    console.log('ESCANEIE ESTE QR CODE COM O WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Tudo pronto! O bot está online no WhatsApp.');
});

client.on('message', async msg => {

    if (msg.from.includes('@g.us') || msg.from.includes('status')) return;

    console.log(`\nProcessando: ${msg.hasMedia ? '[MÍDIA]' : msg.body}`);

    try {
        // 1. DETECTA SE É ÁUDIO
        const isAudio = msg.type === 'ptt' || msg.type === 'audio';

        let media = null;
        if (msg.hasMedia) {
            console.log("⏳ Baixando mídia...");
            media = await msg.downloadMedia();
        }

        const respostaIA = await getGeminiResponse(msg.body, media);

        if (respostaIA) {
            // 2. SE FOI ÁUDIO, RESPONDE COM ÁUDIO
            if (isAudio) {
                console.log('🗣️ Enviando resposta por áudio...');
                const url = googleTTS.getAudioUrl(respostaIA, { lang: 'pt-BR', slow: false, host: 'https://translate.google.com' });
                const audioMedia = await MessageMedia.fromUrl(url, { unsafeMime: true });
                await client.sendMessage(msg.from, audioMedia, { sendAudioAsVoice: true });
            } else {
                // 3. SE NÃO, RESPONDE COM TEXTO NORMALMENTE
                await msg.reply(respostaIA);
            }
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
});

client.initialize();