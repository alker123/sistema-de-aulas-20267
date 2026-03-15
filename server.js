const express = require('express');
const path = require('path');
const session = require('express-session');
const admin = require('firebase-admin');
const app = express();

// --- INICIALIZAÇÃO SEGURA DO FIREBASE ---
let serviceAccount = null;

if (process.env.FIREBASE_KEY) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
        console.log("✅ Variável FIREBASE_KEY detectada.");
    } catch (e) {
        console.error("❌ Erro ao converter FIREBASE_KEY para JSON:", e.message);
    }
} else {
    try {
        serviceAccount = require("./firebase-key.json");
        console.log("🏠 Usando chave local firebase-key.json");
    } catch (e) {
        console.log("⚠️ Nenhuma chave encontrada (Local ou Render).");
    }
}

// SÓ INICIALIZA SE TIVER A CHAVE
if (serviceAccount) {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://aulas1-9044b-default-rtdb.firebaseio.com/"
        });
    }
} else {
    console.error("🚨 CRÍTICO: O Firebase não pôde ser inicializado!");
}

// IMPORTANTE: Só chame o database() APÓS o initializeApp
const db = admin.apps.length ? admin.database() : null;

// --- CONFIGURAÇÕES DO EXPRESS ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'segredo-capoeira',
    resave: true,
    saveUninitialized: false,
    rolling: true,
    cookie: { maxAge: 900000 } // 15 minutos
}));

// --- ROTAS PRINCIPAIS ---

app.get('/auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/index.html'));
});

app.post('/index', async (req, res) => {
    const user = req.body.user ? req.body.user.trim().toLowerCase() : "";
    const pass = req.body.pass ? String(req.body.pass).trim() : "";

    try {
        const usersRef = db.ref('usuarios');
        const snapshot = await usersRef.once('value');
        const usuarios = snapshot.val();

        let usuarioEncontrado = null;

        if (usuarios) {
            for (let id in usuarios) {
                const u = usuarios[id];
                const dbUser = u.username ? String(u.username).trim().toLowerCase() : "";
                const dbEmail = u.email ? String(u.email).trim().toLowerCase() : "";
                const dbPass = u.password ? String(u.password).trim() : "";

                if ((dbUser === user || dbEmail === user) && dbPass === pass) {
                    usuarioEncontrado = u;
                    break;
                }
            }
        }

        if (usuarioEncontrado) {
            const tipo = usuarioEncontrado.rota.split('.')[0];
            req.session.tipo = tipo;
            req.session.nome = usuarioEncontrado.username;
            res.json({ success: true, redirect: `/auth/${tipo}` });
        } else {
            res.status(401).json({ success: false, message: "Dados incorretos" });
        }
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// --- API E LOGOUT ---

app.get('/api/usuario-logado', (req, res) => {
    if (req.session.nome) {
        res.json({ nome: req.session.nome });
    } else {
        res.status(401).json({ erro: "Não logado" });
    }
});

app.get('/sair', (req, res) => {
    req.session.destroy();
    res.redirect('/auth');
});

app.get('/auth/:pagina', (req, res) => {
    const pagina = req.params.pagina;
    if (req.session.tipo === pagina) {
        res.sendFile(path.join(__dirname, `views/${pagina}.html`));
    } else {
        res.redirect('/auth');
    }
});

// --- ROTAS DE RECUPERAÇÃO E CADASTRO ---

app.post('/api/buscar-usuario-por-email', async (req, res) => {
    const { email } = req.body;
    try {
        const snapshot = await db.ref('usuarios').once('value');
        const usuarios = snapshot.val();
        let userKey = null;

        if (usuarios) {
            for (let key in usuarios) {
                if (usuarios[key].email === email) {
                    userKey = key;
                    break;
                }
            }
        }

        if (userKey) {
            res.json({ success: true, userKey });
        } else {
            res.status(404).json({ success: false, message: "E-mail não encontrado." });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/atualizar-senha', async (req, res) => {
    const { userKey, newPass } = req.body;
    try {
        await db.ref(`usuarios/${userKey}`).update({ password: newPass });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/cadastrar-usuario', async (req, res) => {
    const { username, password, email, nome, telefone, rota } = req.body;
    try {
        const userRef = db.ref('usuarios/' + username);
        const snapshot = await userRef.once('value');
        if (snapshot.exists()) {
            return res.status(400).json({ success: false, message: "Este nome de usuário já está em uso." });
        }
        await userRef.set({
            username, password, email, nome, telefone,
            rota: rota || "aluno.html",
            dataCriacao: new Date().toISOString()
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: "Erro interno." });
    }
});

// --- MONITOR E LISTENER (PORTA CORRIGIDA) ---

db.ref('.info/connected').on('value', (snap) => {
    if (snap.val() === true) console.log("✅ CONECTADO AO FIREBASE!");
    else console.log("❌ DESCONECTADO DO FIREBASE!");
});

// AQUI ESTÁ O AJUSTE PARA O RENDER
const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});