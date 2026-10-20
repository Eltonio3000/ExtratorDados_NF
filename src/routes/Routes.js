import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authController } from '../controller/Controller.js';
import { extrairDadosPDF } from '../controller/danfeController.js';
import { upload } from '../config/upload.js';
import { supabase } from '../config/Supabase.js'; // Confirme se seu arquivo de conexão está em src/config
import bcrypt from 'bcryptjs';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewPath = path.join(__dirname, '../view');


router.get('/login', (req, res) => {
    res.sendFile(path.join(viewPath, 'index.html'));
});
router.get('/registro', (req, res) => {
    res.sendFile(path.join(viewPath, 'Registro.html'));
});
router.get('/extrairdados', (req, res) => {
    res.sendFile(path.join(viewPath, 'ExtrairDados.html'));
});
router.get('/historico', (req, res) => {
    res.sendFile(path.join(viewPath, 'Historico.html'));
});
router.get('/gerencia', (req, res) => {
    res.sendFile(path.join(viewPath, 'Gerencia.html'));
});
router.get('/configuracao', (req, res) => {
    res.sendFile(path.join(viewPath, 'Configuracao.html'));
});

router.post('/api/auth/registro', authController.registrar);
router.post('/api/auth/login', authController.login);
router.post('/api/extrair-pdf', upload.single('pdfFile'), extrairDadosPDF);


// ROTA DE VERIFICAÇÃO (Consulta no Banco)
router.post('/api/extrair/consultar-existencia', async (req, res) => {
    try {
        const { idUsuario, tipo_registro, fornecedor, faturado, classificacao } = req.body;

        const tabelaTPDestino = (tipo_registro === 'Receita') ? 'tipo_receita' : 'tipo_despesa';

        // -------------------------------------------------------------------------
        // 1. CONSULTA FORNECEDOR (Busca estrita com máscara e nome exato)
        // -------------------------------------------------------------------------
        let fornecedorExistente = null;
        const cnpjFormatado = fornecedor?.cnpj?.trim();
        const razaoLimpa = fornecedor?.razao_social?.trim();

        // Se tem CNPJ com máscara, busca pelo CNPJ exato
        if (cnpjFormatado && cnpjFormatado.length >= 14) {
            const { data } = await supabase
                .from('fornecedor')
                .select('id, razao_social, cnpj, criador')
                .eq('cnpj', cnpjFormatado)
                .eq('criador', idUsuario)
                .limit(1);

            if (data && data.length > 0) {
                fornecedorExistente = data[0];
            }
        }

        // Se não encontrou por CNPJ, tenta buscar pela Razão Social (busca exata sem % no início/fim)
        if (!fornecedorExistente && razaoLimpa && razaoLimpa.length > 2) {
            const { data } = await supabase
                .from('fornecedor')
                .select('id, razao_social, cnpj, criador')
                .ilike('razao_social', razaoLimpa) // Sem %, exige o texto exato
                .eq('criador', idUsuario)
                .limit(1);

            if (data && data.length > 0) {
                fornecedorExistente = data[0];
            }
        }

        // -------------------------------------------------------------------------
        // 2. CONSULTA FATURADO (Busca estrita com máscara e nome exato)
        // -------------------------------------------------------------------------
        let faturadoExistente = null;
        const cpfFormatado = faturado?.cpf?.trim();
        const nomeLimpo = faturado?.nome_completo?.trim();

        // Se tem CPF, busca pelo CPF
        if (cpfFormatado && cpfFormatado.length >= 11 && tipo_registro === 'Despesa' ) {
            const { data } = await supabase
                .from('faturado')
                .select('id, nome_completo, cpf, criador')
                .eq('cpf', cpfFormatado)
                .eq('criador', idUsuario)
                .limit(1);

            if (data && data.length > 0) {
                faturadoExistente = data[0];
            }
        }

        // Se não encontrou por CPF, tenta buscar pelo Nome
        if (!faturadoExistente && nomeLimpo && nomeLimpo.length > 2 && tipo_registro === 'Despesa') {
            const { data } = await supabase
                .from('faturado')
                .select('id, nome_completo, cpf, criador')
                .ilike('nome_completo', nomeLimpo) // Sem %, exige o nome exato
                .eq('criador', idUsuario)
                .limit(1);

            if (data && data.length > 0) {
                faturadoExistente = data[0];
            }
        }

        const cpf_cnpjFormatado = cpfFormatado;

        // Se tem CPF/cnpj, busca pelo CPF, tipo receita
        if (cpf_cnpjFormatado && cpf_cnpjFormatado.length >= 11 && tipo_registro === 'Receita' ) {
            const { data } = await supabase
                .from('cliente')
                .select('id, nome, cpf_cnpj, criador')
                .eq('cpf_cnpj', cpf_cnpjFormatado)
                .eq('criador', idUsuario)
                .limit(1);

            if (data && data.length > 0) {
                faturadoExistente = data[0];
            }
        }

        // Se não encontrou por CPF/cnpj, tenta buscar pelo Nome, tipo receita
        if (!faturadoExistente && nomeLimpo && nomeLimpo.length > 2 && tipo_registro === 'Receita') {
            const { data } = await supabase
                .from('cliente')
                .select('id, nome, cpf_cnpj, criador')
                .eq('cpf_cnpj', cpf_cnpjFormatado)
                .eq('criador', idUsuario)
                .limit(1);

            if (data && data.length > 0) {
                faturadoExistente = data[0];
            }
        }

        // -------------------------------------------------------------------------
        // 3. CONSULTA CLASSIFICAÇÃO / TIPO
        // -------------------------------------------------------------------------
        let tipoExistente = null;
        const classifLimpa = classificacao?.trim();

        if (classifLimpa && classifLimpa.length > 2) {
            const { data } = await supabase
                .from(tabelaTPDestino)
                .select('id, categoria_pai, criador')
                .ilike('categoria_pai', `%${classifLimpa}%`)
                .eq('criador', idUsuario)
                .limit(1);

            if (data && data.length > 0) {
                tipoExistente = data[0];
            }
        }

        // Retorna EXISTE (true) APENAS se houver registro retornado na consulta do Supabase
        return res.json({
            fornecedor: {
                dados: fornecedor,
                existe: Boolean(fornecedorExistente),
                id: fornecedorExistente?.id || null
            },
            faturado: {
                dados: faturado,
                existe: Boolean(faturadoExistente),
                id: faturadoExistente?.id || null
            },
            tipo: {
                classificacao: classificacao,
                existe: Boolean(tipoExistente),
                id: tipoExistente?.id || null
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
        const { id_usuario, tipo_registro, dadosExtraidos, verificacao } = req.body;

        if (!id_usuario) {
            return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        const tabelaTPDestino = (tipo_registro === 'Receita') ? 'tipo_receita' : 'tipo_despesa';
        const tabelaAssDestino = (tipo_registro === 'Receita') ? 'conta_receber_tipo_receita' : 'conta_pagar_tipo_despesa';

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
        let idTipoDoc = verificacao.tipo.id;

        // Cadastra Fornecedor se não existir
        if (!idFornecedor && verificacao.fornecedor.dados) {
            const { data: newForn, error: errForn } = await supabase
                .from('fornecedor')
                .insert([{
                    razao_social: verificacao.fornecedor.dados.razao_social,
                    cnpj: verificacao.fornecedor.dados.cnpj,
                    criador: id_usuario,
                    ativo: true
                }])
                .select()
                .single();
            if (errForn) throw errForn;
            idFornecedor = newForn.id;
        }

        // Cadastra Faturado/Cliente dependendo do tipo de registro
        if (!idFaturado && verificacao?.faturado?.dados) {
            if (tipo_registro === 'Despesa') {
                const { data: newFat, error: errFat } = await supabase
                    .from('faturado')
                    .insert([{
                        nome_completo: verificacao.faturado.dados.nome_completo,
                        cpf: verificacao.faturado.dados.cpf,
                        criador: id_usuario,
                        ativo: true
                    }])
                    .select()
                    .single();
                if (errFat) throw errFat;
                idFaturado = newFat.id;
            } else {
                const { data: newCli, error: errCli } = await supabase
                    .from('cliente')
                    .insert([{
                        nome: verificacao.faturado.dados.nome_completo,
                        cpf_cnpj: verificacao.faturado.dados.cpf,
                        criador: id_usuario,
                        ativo: true
                    }])
                    .select()
                    .single();
                if (errCli) throw errCli;
                idFaturado = newCli.id;
            }
        }

        // =========================================================================
        // TRAVA DE DUPLICIDADE: Impede registro de NF idêntica para o mesmo faturado
        // =========================================================================
        if (numeroNota && dataEmissaoFormatada && idFaturado) {
            if (tipo_registro === 'Despesa') {
                const { data: notaExistente } = await supabase
                    .from('conta_pagar')
                    .select('id')
                    .eq('numero_nota_fiscal', numeroNota)
                    .eq('data_emissao', dataEmissaoFormatada)
                    .eq('id_faturado', idFaturado)
                    .maybeSingle();

                if (notaExistente) {
                    return res.status(400).json({
                        error: `A Despesa Nº ${numeroNota} emitida em ${dataBruta || dataEmissaoFormatada} já foi cadastrada anteriormente!`
                    });
                }
            } else {
                const { data: notaExistente } = await supabase
                    .from('conta_receber')
                    .select('id')
                    .eq('numero_documento', numeroNota)
                    .eq('data_emissao', dataEmissaoFormatada)
                    .eq('id_cliente', idFaturado)
                    .maybeSingle();

                if (notaExistente) {
                    return res.status(400).json({
                        error: `A Receita Nº ${numeroNota} emitida em ${dataBruta || dataEmissaoFormatada} já foi cadastrada anteriormente!`
                    });
                }
            }
        }
        // =========================================================================

        // Cadastra Tipo de Despesa/Receita se não existir
        if (!idTipoDoc && verificacao.tipo.classificacao) {
            const { data: newDesp, error: errDesp } = await supabase
                .from(tabelaTPDestino)
                .insert([{
                    descricao: "-",
                    categoria_pai: verificacao.tipo.classificacao,
                    ativo: true,
                    criador: id_usuario
                }])
                .select()
                .single();
            if (errDesp) throw errDesp;
            idTipoDoc = newDesp.id;
        }

        // Registra a Nota Fiscal na tabela selecionada
        if (tipo_registro === 'Despesa') {
            const { data: contaPagar, error: errConta } = await supabase
                .from('conta_pagar')
                .insert([{
                    id_fornecedor: idFornecedor,
                    id_faturado: idFaturado,
                    numero_nota_fiscal: numeroNota,
                    data_emissao: dataEmissaoFormatada,
                    descricao_produtos: dadosExtraidos.descricaoProdutos,
                    criador: id_usuario,
                    valor_total: dadosExtraidos.valorTotal
                }])
                .select()
                .single();

            if (errConta) throw errConta;

            // Associa na tabela associativa conta_pagar_tipo_despesa
            if (idTipoDoc) {
                await supabase.from(tabelaAssDestino).insert([{
                    id_conta_pagar: contaPagar.id,
                    id_tipo_despesa: idTipoDoc
                }]);
            }
        } else {
            const { data: contaReceber, error: errConta } = await supabase
                .from('conta_receber')
                .insert([{
                    id_fornecedor: idFornecedor,
                    id_cliente: idFaturado,
                    numero_documento: numeroNota,
                    data_emissao: dataEmissaoFormatada,
                    descricao: dadosExtraidos.descricaoProdutos,
                    criador: id_usuario,
                    valor_total: dadosExtraidos.valorTotal
                }])
                .select()
                .single();

            if (errConta) throw errConta;

            // Associa na tabela associativa conta_receber_tipo_receita
            if (idTipoDoc) {
                await supabase.from(tabelaAssDestino).insert([{
                    id_conta_receber: contaReceber.id,
                    id_tipo_receita: idTipoDoc
                }]);
            }
        }

        return res.json({ success: true, message: `Nota fiscal salva como ${tipo_registro} com sucesso!` });

    } catch (error) {
        console.error('Erro ao salvar nota fiscal:', error);
        res.status(500).json({ error: error.message || 'Erro ao registrar nota fiscal.' });
    }
});

// Rota para listar / buscar histórico de contas a pagar
router.get('/api/notas/historico', async (req, res) => {
    try {
        const termo = req.query.termo ? String(req.query.termo).trim() : '';
        const idUser = req.query.idUser;
        const termoLower = termo.toLowerCase();

        // -------------------------------------------------------------------------
        // 1. FILTRO APENAS DE DESPESAS
        // -------------------------------------------------------------------------
        if (['despesas', 'despesa', 'Despesas', 'Despesa'].includes(termoLower)) {
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
                    criador,
                    conta_pagar_tipo_despesa (
                        tipo_despesa ( id, categoria_pai, descricao )
                    )
                `)
                .eq('criador', idUser)
                .order('data_emissao', { ascending: false });

            if (error) throw error;
            return res.json({ success: true, data: formatarNotas(notas, "Despesa") });
        }

        // -------------------------------------------------------------------------
        // 2. FILTRO APENAS DE RECEITAS
        // -------------------------------------------------------------------------
        if (['receitas', 'receita', 'Receitas', 'Receita'].includes(termoLower)) {
            const { data: notas, error } = await supabase
                .from('conta_receber')
                .select(`
                    id,
                    numero_documento,
                    data_emissao,
                    valor_total,
                    descricao,
                    fornecedor ( id, razao_social, cnpj ),
                    cliente ( id, nome, cpf_cnpj ),
                    criador,
                    conta_receber_tipo_receita (
                        tipo_receita ( id, categoria_pai, descricao )
                    )
                `)
                .eq('criador', idUser)
                .order('data_emissao', { ascending: false });

            if (error) throw error;
            return res.json({ success: true, data: formatarNotas(notas, "Receita") });
        }

        // -------------------------------------------------------------------------
        // 3. BUSCAR TODAS AS NOTAS (Sem filtro de busca)
        // -------------------------------------------------------------------------
        if (!termo) {
            const [{ data: despesas, error: errDesp }, { data: receitas, error: errRec }] = await Promise.all([
                supabase.from('conta_pagar').select(`
                    id, numero_nota_fiscal, data_emissao, valor_total, descricao_produtos,
                    fornecedor ( id, razao_social, cnpj ),
                    faturado ( id, nome_completo, cpf ),
                    criador,
                    conta_pagar_tipo_despesa ( tipo_despesa ( id, categoria_pai, descricao ) )
                `).eq('criador', idUser).order('data_emissao', { ascending: false }),

                supabase.from('conta_receber').select(`
                    id, numero_documento, data_emissao, valor_total, descricao,
                    fornecedor ( id, razao_social, cnpj ),
                    cliente ( id, nome, cpf_cnpj ),
                    criador,
                    conta_receber_tipo_receita ( tipo_receita ( id, categoria_pai, descricao ) )
                `).eq('criador', idUser).order('data_emissao', { ascending: false })
            ]);

            if (errDesp) throw errDesp;
            if (errRec) throw errRec;

            const listaDespesas = formatarNotas(despesas, "Despesa");
            const listaReceitas = formatarNotas(receitas, "Receita");

            // Junta tudo e ordena por data_emissao
            const todasNotas = [...listaDespesas, ...listaReceitas].sort((a, b) =>
                new Date(b.dataEmissaoRaw || 0) - new Date(a.dataEmissaoRaw || 0)
            );

            return res.json({ success: true, data: todasNotas });
        }

        // -------------------------------------------------------------------------
        // 4. BUSCA COM TERMO GENÉRICO (Filtra Por Nome, Documento ou Número da Nota)
        // -------------------------------------------------------------------------
        const [{ data: fornecedores }, { data: faturados }, { data: clientes }] = await Promise.all([
            supabase.from('fornecedor').select('id').ilike('razao_social', `%${termo}%`).eq('criador', idUser),
            supabase.from('faturado').select('id').ilike('nome_completo', `%${termo}%`).eq('criador', idUser),
            supabase.from('cliente').select('id').ilike('nome', `%${termo}%`).eq('criador', idUser)
        ]);

        const idsFornecedores = (fornecedores || []).map(f => f.id);
        const idsFaturados = (faturados || []).map(f => f.id);
        const idsClientes = (clientes || []).map(c => c.id);

        // Condições para Conta a Pagar
        let condDespesa = [`numero_nota_fiscal.ilike.%${termo}%`];
        if (idsFornecedores.length > 0) condDespesa.push(`id_fornecedor.in.(${idsFornecedores.join(',')})`);
        if (idsFaturados.length > 0) condDespesa.push(`id_faturado.in.(${idsFaturados.join(',')})`);

        // Condições para Conta a Receber
        let condReceita = [`numero_documento.ilike.%${termo}%`];
        if (idsFornecedores.length > 0) condReceita.push(`id_fornecedor.in.(${idsFornecedores.join(',')})`);
        if (idsClientes.length > 0) condReceita.push(`id_cliente.in.(${idsClientes.join(',')})`);

        const [{ data: despesasFiltro, error: errFiltroDesp }, { data: receitasFiltro, error: errFiltroRec }] = await Promise.all([
            supabase.from('conta_pagar').select(`
                id, numero_nota_fiscal, data_emissao, valor_total, descricao_produtos,
                fornecedor ( id, razao_social, cnpj ),
                faturado ( id, nome_completo, cpf ),
                criador,
                conta_pagar_tipo_despesa ( tipo_despesa ( id, categoria_pai, descricao ) )
            `).eq('criador', idUser).or(condDespesa.join(',')).order('data_emissao', { ascending: false }),

            supabase.from('conta_receber').select(`
                id, numero_documento, data_emissao, valor_total, descricao,
                id_fornecedor ( id, razao_social, cnpj ),
                id_cliente ( id, nome, cpf_cnpj ),
                criador,
                conta_receber_tipo_receita ( id_tipo_receita ( id, categoria_pai, descricao ) )
            `).eq('criador', idUser).or(condReceita.join(',')).order('data_emissao', { ascending: false })
        ]);

        if (errFiltroDesp) throw errFiltroDesp;
        if (errFiltroRec) throw errFiltroRec;

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
        let classificacoesIds = [];
        let nomesCategorias = [];

        if (tipoNF === 'Despesa') {
            const relacao = nota.conta_pagar_tipo_despesa || [];
            classificacoesIds = relacao
                .map(r => r.tipo_despesa?.id)
                .filter(Boolean);

            nomesCategorias = relacao
                .map(r => {
                    const t = r.tipo_despesa;
                    return t ? t.categoria_pai : null;
                })
                .filter(Boolean);
        } else {
            const relacao = nota.conta_receber_tipo_receita || [];
            classificacoesIds = relacao
                .map(r => r.tipo_receita?.id)
                .filter(Boolean);

            nomesCategorias = relacao
                .map(r => {
                    const t = r.tipo_receita;
                    return t ? t.categoria_pai : null;
                })
                .filter(Boolean);
        }

        return {
            id: nota.id,
            numeroNota: nota.numero_nota_fiscal || nota.numero_documento || 'S/N',
            dataEmissaoRaw: nota.data_emissao,
            dataEmissao: nota.data_emissao ? new Date(nota.data_emissao).toLocaleDateString('pt-BR') : '-',
            fornecedor: nota.fornecedor?.razao_social || 'N/A',
            cnpjFornecedor: nota.fornecedor?.cnpj || '',
            faturado: nota.faturado?.nome_completo || nota.cliente?.nome || 'N/A',

            // Retorna o array de IDs para preencher o modal de edição
            classificacoesIds: classificacoesIds,
            // Lista formatada para a exibição na tabela
            categorias: nomesCategorias.length > 0 ? nomesCategorias : ['Não Classificado'],

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
        const { tipo_registro, classificacoes } = req.body;

        if (Array.isArray(classificacoes) && classificacoes.length > 4) {
            return res.status(400).json({ error: 'Uma nota fiscal não pode ter mais de 4 classificações associadas.' });
        }

        // Normaliza o tipo para minúsculas
        const tipoNorm = (tipo_registro || '').toLowerCase();

        // Define as tabelas e colunas de acordo com o tipo do registro
        const isReceita = tipoNorm === 'receita';
        const tableTarget = isReceita ? 'conta_receber_tipo_receita' : 'conta_pagar_tipo_despesa';
        const fkNota = isReceita ? 'id_conta_receber' : 'id_tipo_receita'; // FK referenciando a nota
        const fkClassificacao = isReceita ? 'id_tipo_receita' : 'id_tipo_despesa';
        const fkNotaColuna = isReceita ? 'id_conta_receber' : 'id_conta_pagar';

        // 1. Remove os vínculos de classificações anteriores para esta nota
        const { error: deleteError } = await supabase
            .from(tableTarget)
            .delete()
            .eq(fkNotaColuna, id);

        if (deleteError) throw deleteError;

        // 2. Se houver classificações selecionadas, insere as novas associações
        if (Array.isArray(classificacoes) && classificacoes.length > 0) {
            const novosVinculos = classificacoes.map(idClass => ({
                [fkNotaColuna]: id,
                [fkClassificacao]: idClass
            }));

            const { error: insertError } = await supabase
                .from(tableTarget)
                .insert(novosVinculos);

            if (insertError) throw insertError;
        }

        return res.json({ success: true, message: 'Classificações da nota fiscal atualizadas com sucesso!' });

    } catch (error) {
        console.error('Erro ao editar nota:', error);

        // Tratamento do erro de chave duplicada (Código PostgreSQL: 23505)
        if (error.code === '23505') {
            return res.status(400).json({
                error: 'Você selecionou classificações duplicadas para esta nota fiscal. Remova as repetidas e tente novamente.'
            });
        }

        return res.status(500).json({ error: 'Erro interno ao atualizar nota fiscal.' });
    }
});

// DELETE - Excluir nota fiscal
router.delete('/api/notas/excluir/:id', async (req, res) => {
    try {
        const { id, } = req.params;
        const { idUser, tipo } = req.query;

        const tableAssTarget = tipo === 'Receita' ? 'conta_recceber_tipo_receita' : 'conta_pagar_tipo_despesa';
        const tableTarget = tipo === 'Receita' ? 'conta_receber' : 'conta_pagar';
        const fkNotaColuna = tipo === 'Receita' ? 'id_conta_receber' : 'id_conta_pagar';

        if (!id && !idUser){
            return res.status(400).json({ error: 'Parâmetros incompletos para realizar a exclusão.' });
        }

        // Remove primeiro da tabela associativa
        await supabase.from(tableAssTarget).delete().eq(fkNotaColuna, id);

        // Remove da tabela conta_pagar
        const { error } = await supabase.from(tableTarget).delete().eq('id', id).eq('criador', idUser);

        if (error) throw error;

        return res.json({ success: true, message: 'Nota fiscal excluída com sucesso!' });

    } catch (error) {
        console.error('Erro ao excluir nota:', error);
        return res.status(500).json({ error: 'Erro ao excluir nota fiscal.' });
    }
});

router.get('/api/gerencia/buscar', async (req, res) => {
    try {
        const { entidade, termo, idUser } = req.query;
        const busca = (termo || '').trim();

        let data = [];
        let error = null;

        if (entidade === 'faturado') {
            // Busca simultaneamente em 'faturado' e em 'cliente'
            let queryFat = supabase.from('faturado').select('id, nome_completo, cpf, ativo, criador').eq('ativo', true).eq('criador', idUser);
            let queryCli = supabase.from('cliente').select('id, nome, cpf_cnpj, ativo, criador').eq('ativo', true).eq('criador', idUser);

            if (busca) {
                queryFat = queryFat.or(`nome_completo.ilike.%${busca}%,cpf.ilike.%${busca}%`);
                queryCli = queryCli.or(`nome.ilike.%${busca}%,cpf_cnpj.ilike.%${busca}%`);
            }

            const [{ data: fatData, error: fatErr }, { data: cliData, error: cliErr }] = await Promise.all([
                queryFat.order('id', { ascending: false }),
                queryCli.order('id', { ascending: false })
            ]);

            if (fatErr) throw fatErr;
            if (cliErr) throw cliErr;

            // Mapeia e padroniza as duas origens em uma única lista
            const listaFat = (fatData || []).map(f => ({
                id: f.id,
                nome: f.nome_completo,
                doc: f.cpf,
                origem: 'Faturado'
            }));

            const listaCli = (cliData || []).map(c => ({
                id: c.id,
                nome: c.nome,
                doc: c.cpf_cnpj,
                origem: 'Cliente'
            }));

            data = [...listaFat, ...listaCli];

        } else if (entidade === 'fornecedor') {
            let query = supabase.from('fornecedor').select('id, razao_social, cnpj, ativo').eq('ativo', true).eq('criador', idUser);
            if (busca) query = query.or(`razao_social.ilike.%${busca}%,cnpj.ilike.%${busca}%`);
            ({ data, error } = await query.order('id', { ascending: false }));

        } else if (entidade === 'classificacao') {
            // Busca tanto em tipo_despesa quanto em tipo_receita
            const [{ data: desp }, { data: rec }] = await Promise.all([
                supabase.from('tipo_despesa').select('id, categoria_pai, descricao, ativo, criador').eq('ativo', true).eq('criador', idUser),
                supabase.from('tipo_receita').select('id, categoria_pai, descricao, ativo, criador').eq('ativo', true).eq('criador', idUser)
            ]);

            const listaDesp = (desp || []).map(d => ({ ...d, tipo: 'Despesa' }));
            const listaRec = (rec || []).map(r => ({ ...r, tipo: 'Receita' }));

            data = [...listaDesp, ...listaRec];

            // Remove da lista os itens com categoria_pai "Geral / Não Classificado"
            data = data.filter(item => {
                const catPai = (item.categoria_pai || '').trim().toLowerCase();
                return catPai !== 'geral / não classificado' && catPai !== 'geral/não classificado';
            });

            if (busca) {
                const bLower = busca.toLowerCase();
                data = data.filter(i =>
                    (i.categoria_pai && i.categoria_pai.toLowerCase().includes(bLower)) ||
                    (i.descricao && i.descricao.toLowerCase().includes(bLower))
                );
            }
        }

        if (error) throw error;
        return res.json({ success: true, data });

    } catch (err) {
        console.error('Erro ao buscar gerência:', err);
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

// Salvar (Editar/Criar) Registro Dinâmico
router.post('/api/gerencia/salvar', async (req, res) => {
    try {
        const { id, entidade, nome, doc, desc, tipo, idUser, origem } = req.body;

        // Trata o ID: se for string vazia, null ou undefined, vira undefined
        // Se tiver valor (edição), converte explicitamente para Number
        const idValido = (id && id !== '') ? Number(id) : undefined;

        if (entidade === 'faturado') {
            const origemNormalizada = (origem || '').toLowerCase();
            const tabelaTarget = (origemNormalizada === 'cliente') ? 'cliente' : 'faturado';
            const campoNome = (tabelaTarget === 'cliente') ? 'nome' : 'nome_completo';
            const campoDoc = (tabelaTarget === 'cliente') ? 'cpf_cnpj' : 'cpf';

            const objetoDados = {
                id: idValido,
                [campoNome]: nome,
                [campoDoc]: doc,
                criador: idUser
            };

            const { error } = await supabase
                .from(tabelaTarget)
                .upsert(objetoDados)
                .eq('criador', idUser);
            if (error) throw error;

        } else if (entidade === 'fornecedor') {
            const { error } = await supabase
                .from('fornecedor')
                .upsert({ id: idValido, razao_social: nome, cnpj: doc, criador: idUser })
                .eq('criador', idUser);
            if (error) throw error;

        } else if (entidade === 'classificacao') {
            // Garante a escolha da tabela correta
            const tabelaTarget = (tipo === 'Receita') ? 'tipo_receita' : 'tipo_despesa';

            // Captura a descrição (seja enviada em 'desc' ou em 'doc')
            const descricaoFinal = desc || doc || '';

            const { error } = await supabase
                .from(tabelaTarget)
                .upsert({
                    id: idValido,
                    categoria_pai: nome,
                    descricao: descricaoFinal,
                    criador: idUser
                });

            if (error) throw error;
        }

        return res.json({ success: true, message: 'Registro salvo com sucesso!' });
    } catch (err) {
        console.error('Erro ao salvar gerência:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Deletar Registro Dinâmico
router.delete('/api/gerencia/deletar', async (req, res) => {
    try {
        const { entidade, id , origem, idUser} = req.query;

        const origemLower = (origem || '').toLowerCase();

        const tabela = entidade === 'faturado' && origemLower === 'cliente' ? 'cliente' :
            entidade === 'faturado' ? 'faturado' :
                entidade === 'fornecedor' ? 'fornecedor' :
                    entidade === 'classificacao' && origemLower === 'receita' ? 'tipo_receita' :
                        'tipo_despesa';

        const { error } = await supabase.from(tabela).update({ativo: false}).eq('id', id).eq('criador', idUser);
        if (error) throw error;

        return res.json({ success: true, message: 'Registro excluído!' });
    } catch (err) {
        console.error('Erro ao deletar:', err);
        return res.status(500).json({ error: 'O registro possui vínculos e não pode ser excluído.' });
    }
});

// Rota para buscar apenas registros INATIVOS
router.get('/api/gerencia/inativos', async (req, res) => {
    try {
        const { entidade, termo , idUser} = req.query;
        const busca = (termo || '').trim();

        let data = [];
        let error = null;

        if (entidade === 'faturado') {
            // Busca simultaneamente em 'faturado' e em 'cliente' onde ativo é false
            let queryFat = supabase
                .from('faturado')
                .select('id, nome_completo, cpf, ativo')
                .eq('ativo', false)
                .eq('criador', idUser);

            let queryCli = supabase
                .from('cliente')
                .select('id, nome, cpf_cnpj, ativo')
                .eq('ativo', false)
                .eq('criador', idUser);

            if (busca) {
                queryFat = queryFat.or(`nome_completo.ilike.%${busca}%,cpf.ilike.%${busca}%`);
                queryCli = queryCli.or(`nome.ilike.%${busca}%,cpf_cnpj.ilike.%${busca}%`);
            }

            const [{ data: fatData, error: fatErr }, { data: cliData, error: cliErr }] = await Promise.all([
                queryFat.order('id', { ascending: false }),
                queryCli.order('id', { ascending: false })
            ]);

            if (fatErr) throw fatErr;
            if (cliErr) throw cliErr;

            // Mapeia e padroniza as duas origens em uma única lista
            const listaFat = (fatData || []).map(f => ({
                id: f.id,
                nome: f.nome_completo,
                doc: f.cpf,
                origem: 'Faturado',
                ativo: f.ativo
            }));

            const listaCli = (cliData || []).map(c => ({
                id: c.id,
                nome: c.nome,
                doc: c.cpf_cnpj,
                origem: 'Cliente',
                ativo: c.ativo
            }));

            data = [...listaFat, ...listaCli];

        } else if (entidade === 'fornecedor') {
            let query = supabase
                .from('fornecedor')
                .select('id, razao_social, cnpj, ativo')
                .eq('ativo', false)
                .eq('criador', idUser);

            if (busca) {
                query = query.or(`razao_social.ilike.%${busca}%,cnpj.ilike.%${busca}%`);
            }

            ({ data, error } = await query.order('id', { ascending: false }));

        } else if (entidade === 'classificacao') {
            // Busca apenas inativas em tipo_despesa e tipo_receita
            const [{ data: desp }, { data: rec }] = await Promise.all([
                supabase
                    .from('tipo_despesa')
                    .select('id, categoria_pai, descricao, ativo')
                    .eq('ativo', false)
                    .eq('criador', idUser),
                supabase
                    .from('tipo_receita')
                    .select('id, categoria_pai, descricao, ativo')
                    .eq('ativo', false)
                    .eq('criador', idUser)
            ]);

            const listaDesp = (desp || []).map(d => ({ ...d, tipo: 'Despesa' }));
            const listaRec = (rec || []).map(r => ({ ...r, tipo: 'Receita' }));

            data = [...listaDesp, ...listaRec];

            // Remove da lista os itens com categoria_pai "Geral / Não Classificado"
            data = data.filter(item => {
                const catPai = (item.categoria_pai || '').trim().toLowerCase();
                return catPai !== 'geral / não classificado' && catPai !== 'geral/não classificado';
            });

            if (busca) {
                const bLower = busca.toLowerCase();
                data = data.filter(i =>
                    (i.categoria_pai && i.categoria_pai.toLowerCase().includes(bLower)) ||
                    (i.descricao && i.descricao.toLowerCase().includes(bLower))
                );
            }
        }

        if (error) throw error;
        return res.json({ success: true, data });

    } catch (err) {
        console.error('Erro ao buscar registros inativos:', err);
        return res.status(500).json({ error: 'Erro interno no servidor ao consultar inativos.' });
    }
});

// A. Consultar perfil do usuário autenticado
router.get('/api/usuario/meu-perfil', async (req, res) => {
    try {
        const id_usuario = req.query.id_usuario;
        const { data, error } = await supabase
            .from('usuario')
            .select('id, nome_completo, email, ativo')
            .eq('id', id_usuario)
            .single();

        if (error) throw error;

        return res.json({ success: true, data });
    } catch (err) {
        console.error('Erro ao buscar perfil:', err);
        return res.status(500).json({ error: 'Erro ao carregar dados do usuário.' });
    }
});

// B. Atualizar e-mail do usuário
router.put('/api/usuario/atualizar-email', async (req, res) => {
    try {
        const { id, email } = req.body;

        if (!id || !email) {
            return res.status(400).json({ error: 'ID e e-mail são obrigatórios.' });
        }

        const { error } = await supabase
            .from('usuario')
            .update({ email })
            .eq('id', id);

        if (error) throw error;

        return res.json({ success: true, message: 'E-mail alterado com sucesso!' });
    } catch (err) {
        console.error('Erro ao atualizar e-mail:', err);
        return res.status(500).json({ error: 'Não foi possível atualizar o e-mail.' });
    }
});

// C. Exclusão Lógica (Inativação da Conta)
router.patch('/api/usuario/inativar/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Altera o status 'ativo' para false sem deletar a linha da tabela 'usuario'
        const { error } = await supabase
            .from('usuario')
            .update({ ativo: false })
            .eq('id', id);

        if (error) throw error;

        // Destrói a sessão caso esteja usando express-session
        if (req.session) {
            req.session.destroy();
        }

        return res.json({ success: true, message: 'Conta inativada com sucesso.' });
    } catch (err) {
        console.error('Erro ao inativar conta:', err);
        return res.status(500).json({ error: 'Erro ao desativar conta.' });
    }
});

// Rota para Alteração de Senha com validação por bcryptjs
router.put('/api/usuario/alterar-senha', async (req, res) => {
    try {
        const { id, senhaAtual, novaSenha } = req.body;

        if (!id || !senhaAtual || !novaSenha) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }

        // 1. Busca o hash da senha cadastrada no banco de dados
        const { data: usuario, error: fetchError } = await supabase
            .from('usuario')
            .select('id, senha')
            .eq('id', id)
            .single();

        if (fetchError || !usuario) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        // 2. Compara a senha atual enviada com o hash salvo no Supabase
        const senhaCorreta = await bcrypt.compare(senhaAtual, usuario.senha);
        if (!senhaCorreta) {
            return res.status(400).json({ error: 'A senha atual informada está incorreta.' });
        }

        // 3. Gera o novo hash para a nova senha
        const salt = await bcrypt.genSalt(10);
        const novoHash = await bcrypt.hash(novaSenha, salt);

        // 4. Atualiza a senha no banco de dados
        const { error: updateError } = await supabase
            .from('usuario')
            .update({ senha: novoHash })
            .eq('id', id);

        if (updateError) throw updateError;

        return res.json({ success: true, message: 'Senha atualizada com sucesso!' });
    } catch (err) {
        console.error('Erro ao alterar senha:', err);
        return res.status(500).json({ error: 'Erro interno ao processar alteração de senha.' });
    }
});

// Rota para RESTAURAR um registro
router.put('/api/gerencia/restaurar', async (req, res) => {
    try {
        const { entidade, id, origem, idUser } = req.body;

        if (!entidade || !id) {
            return res.status(400).json({ error: 'Entidade e ID são obrigatórios.' });
        }

        const origemLower = (origem || '').toLowerCase();
        let tabela = '';

        // Mapeamento idêntico de tabelas
        if (entidade === 'faturado') {
            tabela = (origemLower === 'cliente') ? 'cliente' : 'faturado';
        } else if (entidade === 'fornecedor') {
            tabela = 'fornecedor';
        } else if (entidade === 'classificacao') {
            tabela = (origemLower === 'receita') ? 'tipo_receita' : 'tipo_despesa';
        }

        const { error } = await supabase
            .from(tabela)
            .update({ ativo: true })
            .eq('id', id)
            .eq('criador', idUser);

        if (error) throw error;

        return res.json({ success: true, message: 'Registro restaurado com sucesso!' });

    } catch (err) {
        console.error('Erro ao restaurar registro:', err);
        return res.status(500).json({ error: 'Erro interno ao restaurar o registro.' });
    }
});

export default router;