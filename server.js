import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Routes from './src/routes/Routes.js';
import multer from "multer";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Garante que a pasta uploads exita
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src/view')));
app.use(express.static(path.join(__dirname, 'public')));

// Registra os módulos de rotas sob o prefixo /api
app.use('/api', Routes);

// Tratamento centralizado de erros do Express/Multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'O arquivo PDF excede o tamanho máximo de 10MB.' });
        }
        return res.status(400).json({ error: err.message });
    } else if (err instanceof Error) {
        return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Erro interno no servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});