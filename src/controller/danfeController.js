import { processarNotaFiscalPDF } from '../Agent/geminiService.js';
import fs from 'fs';

export async function extrairDadosPDF(req, res) {
  try {

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF foi enviado.' });
    }

    const dadosExtraidos = await processarNotaFiscalPDF(req.file.path);

    // Opcional: deletar arquivo temporário da pasta uploads após leitura
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.json(dadosExtraidos);
  } catch (error) {
    console.error('Erro na extração:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: 'Erro ao processar a nota fiscal com a IA.' });
  }
}