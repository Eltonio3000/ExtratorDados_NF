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

router.get('/extrairdados', (req, res) => {
    res.sendFile(path.join(viewPath, 'index.html'));
});
router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(viewPath, 'Dashboard.html'));
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

// Rota para listar / buscar histórico de contas a pagar
router.get('/api/notas/historico', async (req, res) => {
    try {
        const { termo } = req.query;
        const termoNormalizado = (termo).trim().toLowerCase();

        // Se termo receber despesas, traz todas as notas de conta a pagar
        if (termo === 'Despesas' || termo === 'despesas' || termo === 'Despesa' || termo === 'despesa') {
            const { data: notas, error } = await supabase
                .from('conta_pagar')
                .select(`
                    id,
                    numero_nota_fiscal,
                    data_emissao,
                    valor_total,
                    descricao_produtos,
                    fornecedor ( id, razao_social, cnpj ),
                    faturado ( id, nome_completo, cpf ),
                    conta_pagar_tipo_despesa (
                        tipo_despesa ( id, categoria_pai, descricao )
                    )
                `)
                .order('data_emissao', { ascending: false });

            if (error) throw error;

            return res.json({ success: true, data: formatarNotas(notas, "Despesa") });
        }

        // Se termo receber receita, traz todas as notas de conta a receber
        if (termo === 'Receitas' || termo === 'receitas' || termo === 'Receita' || termo === 'receita') {
            const { data: notas, error } = await supabase
                .from('conta_receber')
                .select(`
                    id,
                    numero_nota_fiscal,
                    data_emissao,
                    valor_total,
                    descricao_produtos,
                    fornecedor ( id, razao_social, cnpj ),
                    faturado ( id, nome_completo, cpf ),
                    conta_pagar_tipo_despesa (
                        tipo_despesa ( id, categoria_pai, descricao )
                    )
                `)
                .order('data_emissao', { ascending: false });

            if (error) throw error;

            return res.json({ success: true, data: formatarNotas(notas, "Receita") });
        }

        // Busca por termo genérico (Nº da nota, Fornecedor ou Faturado)
        const [{ data: fornecedores }, { data: faturados }] = await Promise.all([
            supabase.from('fornecedor').select('id').ilike('razao_social', `%${termoNormalizado}%`),
            supabase.from('faturado').select('id').ilike('nome_completo', `%${termoNormalizado}%`)
        ]);

        const idsFornecedores = (fornecedores || []).map(f => f.id);
        const idsFaturados = (faturados || []).map(f => f.id);

        let condicoes = [`numero_nota_fiscal.ilike.%${termoNormalizado}%`];
        if (idsFornecedores.length > 0) condicoes.push(`id_fornecedor.in.(${idsFornecedores.join(',')})`);
        if (idsFaturados.length > 0) condicoes.push(`id_faturado.in.(${idsFaturados.join(',')})`);

        // Executa busca nas duas tabelas
        const [{ data: despesasFiltro, error: errFiltroDesp }, { data: receitasFiltro, error: errFiltroRec }] = await Promise.all([
            supabase.from('conta_pagar').select(`
                id, numero_nota_fiscal, data_emissao, valor_total, descricao_produtos,
                fornecedor ( id, razao_social, cnpj ), faturado ( id, nome_completo, cpf ),
                conta_pagar_tipo_despesa ( tipo_despesa ( id, categoria_pai, descricao ) )
            `).or(condicoes.join(',')).order('data_emissao', { ascending: false }),

            supabase.from('conta_receber').select(`
                id, numero_nota_fiscal, data_emissao, valor_total, descricao_produtos,
                fornecedor ( id, razao_social, cnpj ), faturado ( id, nome_completo, cpf )
            `).or(condicoes.join(',')).order('data_emissao', { ascending: false })
        ]);

        if (errFiltroDesp) throw errFiltroDesp;

        const resultadoDespesas = formatarNotas(despesasFiltro, "Despesa");
        const resultadoReceitas = formatarNotas(receitasFiltro, "Receita");

        const resultadoCombinado = [...resultadoDespesas, ...resultadoReceitas].sort((a, b) =>
            new Date(b.dataEmissaoRaw || 0) - new Date(a.dataEmissaoRaw || 0)
        );

        return res.json({ success: true, data: resultadoCombinado });

    } catch (error) {
        console.error('Erro ao buscar histórico de notas:', error);
        return res.status(500).json({ error: 'Erro ao buscar notas fiscais no banco de dados.' });
    }
});

// Função auxiliar para padronizar o retorno para o frontend
function formatarNotas(notas, tipoNF) {
    return (notas || []).map(nota => {
        const despesaObj = nota.conta_pagar_tipo_despesa?.[0]?.tipo_despesa;
        return {
            id: nota.id,
            numeroNota: nota.numero_nota_fiscal || 'S/N',
            dataEmissaoRaw: nota.data_emissao,
            dataEmissao: nota.data_emissao ? new Date(nota.data_emissao).toLocaleDateString('pt-BR') : '-',
            fornecedor: nota.fornecedor?.razao_social || 'N/A',
            cnpjFornecedor: nota.fornecedor?.cnpj || '',
            faturado: nota.faturado?.nome_completo || 'N/A',
            categoria: despesaObj?.categoria_pai || despesaObj?.descricao || 'Não Classificado',
            valorTotalRaw: nota.valor_total,
            valorTotal: nota.valor_total ? Number(nota.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00',
            tipo: tipoNF
        };
    });
}

// PUT - Editar nota fiscal existente
router.put('/api/notas/editar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_nota_fiscal, data_emissao, valor_total, tipo_registro } = req.body;

        const { error } = await supabase
            .from('conta_pagar')
            .update({
                numero_nota_fiscal,
                data_emissao,
                valor_total,
                tipo_registro
            })
            .eq('id', id);

        if (error) throw error;

        return res.json({ success: true, message: 'Nota fiscal atualizada com sucesso!' });
    } catch (error) {
        console.error('Erro ao editar nota:', error);
        return res.status(500).json({ error: 'Erro ao atualizar nota fiscal.' });
    }
});

// DELETE - Excluir nota fiscal
router.delete('/api/notas/excluir/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Remove primeiro da tabela associativa
        await supabase.from('conta_pagar_tipo_despesa').delete().eq('id_conta_pagar', id);

        // Remove da tabela conta_pagar
        const { error } = await supabase.from('conta_pagar').delete().eq('id', id);

        if (error) throw error;

        return res.json({ success: true, message: 'Nota fiscal excluída com sucesso!' });
    } catch (error) {
        console.error('Erro ao excluir nota:', error);
        return res.status(500).json({ error: 'Erro ao excluir nota fiscal.' });
    }
});

export default router;