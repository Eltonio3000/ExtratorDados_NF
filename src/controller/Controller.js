import { supabase } from '../config/Supabase.js';
import bcrypt from 'bcryptjs';

export const authController = {
    // Cadastrar Novo Usuário
    async registrar(req, res) {
        try {
            const { nome_completo, cpf_cnpj, email, senha } = req.body;

            // Validação de campos obrigatórios
            if (!nome_completo || !cpf_cnpj || !email || !senha) {
                return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
            }

            // Verifica se e-mail ou CPF/CNPJ já existem no banco
            const { data: usuarioExistente } = await supabase
                .from('usuario')
                .select('id')
                .or(`email.eq.${email},cpf_cnpj.eq.${cpf_cnpj}`)
                .single();

            if (usuarioExistente) {
                return res.status(400).json({ error: 'E-mail ou CPF/CNPJ já cadastrado.' });
            }

            // Criptografa a senha antes de salvar
            const senha_hash = await bcrypt.hash(senha, 10);

            // Insere o usuário na tabela 'usuario'
            const { data, error } = await supabase
                .from('usuario')
                .insert([
                    {
                        nome_completo,
                        cpf_cnpj,
                        email,
                        senha: senha_hash
                    }
                ])
                .select();

            if (error) throw error;

            return res.status(201).json({
                message: 'Usuário cadastrado com sucesso!',
                user: { id: data[0].id, email: data[0].email }
            });

        } catch (error) {
            console.error('Erro no cadastro:', error);
            return res.status(500).json({ error: 'Erro interno ao realizar cadastro.' });
        }
    },

    // Autenticar Usuário (Login)
    async login(req, res) {
        try {
            const { email, senha } = req.body;

            if (!email || !senha) {
                return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
            }

            // Busca o usuário pelo e-mail
            const { data: usuario, error } = await supabase
                .from('usuario')
                .select('*')
                .eq('email', email)
                .single();

            if (error || !usuario) {
                return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
            }

            // Valida a senha informada com o hash salvo no banco
            const senhaValida = await bcrypt.compare(senha, usuario.senha);
            if (!senhaValida) {
                return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
            }

            return res.status(200).json({
                message: 'Login realizado com sucesso!',
                user: {
                    id: usuario.id,
                    nome_completo: usuario.nome_completo,
                    email: usuario.email
                }
            });

        } catch (error) {
            console.error('Erro no login:', error);
            return res.status(500).json({ error: 'Erro interno ao realizar login.' });
        }
    }
};