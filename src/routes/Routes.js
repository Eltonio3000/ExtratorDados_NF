import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authController } from '../controller/Controller.js';
import { extrairDadosPDF } from '../controller/danfeController.js';
import { upload } from '../config/upload.js';
import { supabase } from '../config/Supabase.js'; // Confirme se seu arquivo de conexão está em src/config

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewPath = path.join(__dirname, '../view');


router.get('/login', (req, res) => {
    res.sendFile(path.join(viewPath, 'Login.html'));
});

router.get('/registro', (req, res) => {
    res.sendFile(path.join(viewPath, 'Registro.html'));
});

router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(viewPath, 'index.html'));
});

router.post('/api/auth/registro', authController.registrar);
router.post('/api/auth/login', authController.login);
router.post('/api/extrair-pdf', upload.single('pdfFile'), extrairDadosPDF);


// ROTA DE VERIFICAÇÃO (Consulta no Banco)
router.post('/api/extrair/consultar-existencia', async (req, res) => {
    try {
        const { fornecedor, faturado, classificacao } = req.body;

        // Consulta Fornecedor no Supabase (por CNPJ ou Razão Social)
        let fornecedorExistente = null;
        if (fornecedor?.cnpj || fornecedor?.razao_social) {
            let query = supabase.from('fornecedor').select('id, razao_social, cnpj');
            if (fornecedor.cnpj) {
                query = query.eq('cnpj', fornecedor.cnpj);
            } else {
                query = query.ilike('razao_social', `%${fornecedor.razao_social}%`);
            }
            const { data } = await query.maybeSingle();
            fornecedorExistente = data;
        }

        // Consulta Faturado no Supabase (por CPF ou Nome)
        let faturadoExistente = null;
        if (faturado?.cpf || faturado?.nome_completo) {
            let query = supabase.from('faturado').select('id, nome_completo, cpf');
            if (faturado.cpf) {
                query = query.eq('cpf', faturado.cpf);
            } else {
                query = query.ilike('nome_completo', `%${faturado.nome_completo}%`);
            }
            const { data } = await query.maybeSingle();
            faturadoExistente = data;
        }

        // C. Consulta Tipo de Despesa no Supabase
        let despesaExistente = null;
        if (classificacao) {
            const { data } = await supabase
                .from('tipo_despesa')
                .select('id, categoria_pai')
                .ilike('categoria_pai', `%${classificacao}%`)
                .maybeSingle();
            despesaExistente = data;
        }

        return res.json({
            fornecedor: {
                dados: fornecedor,
                existe: !!fornecedorExistente,
                id: fornecedorExistente?.id || null
            },
            faturado: {
                dados: faturado,
                existe: !!faturadoExistente,
                id: faturadoExistente?.id || null
            },
            despesa: {
                classificacao: classificacao,
                existe: !!despesaExistente,
                id: despesaExistente?.id || null
            }
        });

    } catch (error) {
        console.error('Erro na consulta de existência:', error);
        res.status(500).json({ error: 'Erro ao consultar banco de dados.' });
    }
});

// ROTA PARA SALVAR A NOTA E SEUS VÍNCULOS
router.post('/api/extrair/salvar-nota', async (req, res) => {
    try {
        const { id_usuario, dadosExtraidos, verificacao } = req.body;

        if (!id_usuario) {
            return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        // Função auxiliar para converter DD/MM/AAAA ou AAAA-MM-DD para ISO YYYY-MM-DD
        function formatarDataParaBD(dataString) {
            if (!dataString) return null;

            // Se já estiver no formato AAAA-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dataString)) {
                return dataString;
            }

            // Se estiver no formato DD/MM/AAAA
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataString)) {
                const [dia, mes, ano] = dataString.split('/');
                return `${ano}-${mes}-${dia}`;
            }

            return null;
        }

        const dataBruta = dadosExtraidos.dataEmissao;
        const dataEmissaoFormatada = formatarDataParaBD(dataBruta);
        const numeroNota = dadosExtraidos.numeroNotaFiscal;
        let idFornecedor = verificacao.fornecedor.id;
        let idFaturado = verificacao.faturado.id;
        let idTipoDespesa = verificacao.despesa.id;

        // Cadastra Fornecedor se não existir
        if (!idFornecedor && verificacao.fornecedor.dados) {
            const { data: newForn, error: errForn } = await supabase
                .from('fornecedor')
                .insert([{
                    razao_social: verificacao.fornecedor.dados.razao_social,
                    cnpj: verificacao.fornecedor.dados.cnpj,
                    ativo: true
                }])
                .select()
                .single();
            if (errForn) throw errForn;
            idFornecedor = newForn.id;
        }

        // Cadastra Faturado se não existir
        if (!idFaturado && verificacao.faturado.dados) {
            const { data: newFat, error: errFat } = await supabase
                .from('faturado')
                .insert([{
                    nome_completo: verificacao.faturado.dados.nome_completo,
                    cpf: verificacao.faturado.dados.cpf,
                    ativo: true
                }])
                .select()
                .single();
            if (errFat) throw errFat;
            idFaturado = newFat.id;
        }

        // =========================================================================
        // TRAVA DE DUPLICIDADE: Impede registro de NF idêntica para o mesmo faturado
        // =========================================================================
        if (numeroNota && dataEmissaoFormatada && idFaturado) {
            const { data: notaExistente } = await supabase
                .from('conta_pagar')
                .select('id')
                .eq('numero_nota_fiscal', numeroNota)
                .eq('data_emissao', dataEmissaoFormatada)
                .eq('id_faturado', idFaturado)
                .maybeSingle();

            if (notaExistente) {
                return res.status(400).json({
                    error: `A Nota Fiscal Nº ${numeroNota} emitida em ${dadosExtraidos.dataEmissao} já foi cadastrada anteriormente!`
                });
            }
        }
        // =========================================================================

        // Cadastra Tipo de Despesa se não existir
        if (!idTipoDespesa && verificacao.despesa.classificacao) {
            const { data: newDesp, error: errDesp } = await supabase
                .from('tipo_despesa')
                .insert([{
                    descricao: "-",
                    categoria_pai: verificacao.despesa.classificacao,
                    ativo: true
                }])
                .select()
                .single();
            if (errDesp) throw errDesp;
            idTipoDespesa = newDesp.id;
        }

        // Registra a Conta a Pagar
        const { data: contaPagar, error: errConta } = await supabase
            .from('conta_pagar')
            .insert([{
                id_fornecedor: idFornecedor,
                id_faturado: idFaturado,
                numero_nota_fiscal: dadosExtraidos.numeroNotaFiscal,
                data_emissao: dataEmissaoFormatada,
                descricao_produtos: JSON.stringify(dadosExtraidos.descricaoProdutos || []),
                valor_total: dadosExtraidos.valorTotal
            }])
            .select()
            .single();

        if (errConta) throw errConta;

        // Associa Tipo de Despesa à Conta a Pagar
        if (idTipoDespesa) {
            await supabase.from('conta_pagar_tipo_despesa').insert([{
                id_conta_pagar: contaPagar.id,
                id_tipo_despesa: idTipoDespesa
            }]);
        }

        return res.json({ success: true, message: 'Nota fiscal salva com sucesso!' });

    } catch (error) {
        console.error('Erro ao salvar nota fiscal:', error);
        res.status(500).json({ error: error.message || 'Erro ao registrar nota fiscal.' });
    }
});

export default router;