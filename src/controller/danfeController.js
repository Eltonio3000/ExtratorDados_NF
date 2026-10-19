import { processarNotaFiscalPDF } from '../Agent/geminiService.js';
import { supabase } from '../config/Supabase.js';
import fs from 'fs';

export async function extrairDadosPDF(req, res) {
  try {

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF foi enviado.' });
    }

    const tipoRegistro = req.body.tipo_registro || 'Despesa'; // 'Despesa' ou 'Receita'
    const idUsuario = req.body.usuario.id;

    const tabelaCategorias = (tipoRegistro === 'Receita') ? 'tipo_receita' : 'tipo_despesa';

    // Busca as categorias ativas do usuário logado na tabela correspondente
    let query = supabase
        .from(tabelaCategorias)
        .select('id, descricao, categoria_pai')
        .eq('ativo', true);

    if (idUsuario) {
      query = query.eq('criador', idUsuario);
    }

    const { data: categorias, error: errCat } = await query;

    if (errCat) {
      console.error('Erro ao buscar categorias do banco:', errCat);
    }

    const dadosExtraidos = await processarNotaFiscalPDF(
        req.file.path,
        tipoRegistro,
        categorias || []
    );

    // deletar arquivo temporário da pasta uploads após leitura
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