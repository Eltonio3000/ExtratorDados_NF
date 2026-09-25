# estrutura

leitor-danfe-gemini/

├── uploads/                     # Pasta temporária para guardar os PDFs enviados

├── src/

│   ├── config/

│   │   └── multer.js            # Configuração do recebimento do arquivo PDF

│   ├── controllers/

│   │   └── danfeController.js   # Recebe o arquivo e responde para a página web

│   ├── services/

│   │   └── geminiService.js     # Conecta com a API do Gemini e envia o PDF

│   └── views/                   # Sua página web (HTML/JS para fazer o upload)

│       └── index.html

├── public/                      # CSS/JS estáticos da página web (se necessário)

│   └── style.css

├── .env                         # Onde fica a sua chave: GEMINI_API_KEY

├── package.json

└── server.js                    # Inicializa o servidor Express


# banco de dados

-- ============================================================
-- SCRIPT DE CRIAÇÃO DO BANCO DE DADOS: PROJETO ADMIN-FINANCEIRO
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELA: FORNECEDOR
-- ------------------------------------------------------------
CREATE TABLE fornecedor (
id SERIAL PRIMARY KEY,
razao_social VARCHAR(255) NOT NULL,
nome_fantasia VARCHAR(255),
cnpj VARCHAR(18) UNIQUE NOT NULL,
ativo BOOLEAN NOT NULL DEFAULT TRUE,
data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 2. TABELA: CLIENTE
-- ------------------------------------------------------------
CREATE TABLE cliente (
id SERIAL PRIMARY KEY,
nome VARCHAR(255) NOT NULL,
cpf_cnpj VARCHAR(18) UNIQUE NOT NULL,
ativo BOOLEAN NOT NULL DEFAULT TRUE,
data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 3. TABELA: FATURADO (Pessoa/Empresa em nome de quem sai a NF)
-- ------------------------------------------------------------
CREATE TABLE faturado (
id SERIAL PRIMARY KEY,
nome_completo VARCHAR(255) NOT NULL,
cpf VARCHAR(14) UNIQUE NOT NULL,
ativo BOOLEAN NOT NULL DEFAULT TRUE,
data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 4. TABELA: TIPO DE DESPESA (Categorias principais/subcategorias)
-- ------------------------------------------------------------
CREATE TABLE tipo_despesa (
id SERIAL PRIMARY KEY,
descricao VARCHAR(100) NOT NULL,
categoria_pai VARCHAR(100), -- Ex: INSUMOS AGRÍCOLAS, MANUTENÇÃO E OPERAÇÃO
ativo BOOLEAN NOT NULL DEFAULT TRUE,
data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 5. TABELA: TIPO DE RECEITA
-- ------------------------------------------------------------
CREATE TABLE tipo_receita (
id SERIAL PRIMARY KEY,
descricao VARCHAR(100) NOT NULL,
ativo BOOLEAN NOT NULL DEFAULT TRUE,
data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 6. TABELA: CONTAS A PAGAR
-- ------------------------------------------------------------
CREATE TABLE conta_pagar (
id SERIAL PRIMARY KEY,
id_fornecedor INT NOT NULL,
id_faturado INT NOT NULL,
numero_nota_fiscal VARCHAR(50) NOT NULL,
data_emissao DATE NOT NULL,
descricao_produtos TEXT, -- Armazena a descrição conforme extraído pela IA
valor_total NUMERIC(15, 2) NOT NULL,
data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT fk_conta_pagar_fornecedor FOREIGN KEY (id_fornecedor) REFERENCES fornecedor (id),
CONSTRAINT fk_conta_pagar_faturado FOREIGN KEY (id_faturado) REFERENCES faturado (id)
);

-- Relacionamento N:M (Uma Conta a Pagar pode ter uma ou mais Classificações de Despesa)
CREATE TABLE conta_pagar_tipo_despesa (
id_conta_pagar INT NOT NULL,
id_tipo_despesa INT NOT NULL,
PRIMARY KEY (id_conta_pagar, id_tipo_despesa),
CONSTRAINT fk_cptd_conta FOREIGN KEY (id_conta_pagar) REFERENCES conta_pagar (id) ON DELETE CASCADE,
CONSTRAINT fk_cptd_despesa FOREIGN KEY (id_tipo_despesa) REFERENCES tipo_despesa (id)
);

-- Tabela de Parcelas (Uma Conta a Pagar pode ter uma ou mais parcelas)
CREATE TABLE parcela_conta_pagar (
id SERIAL PRIMARY KEY,
id_conta_pagar INT NOT NULL,
numero_parcela INT NOT NULL,
data_vencimento DATE NOT NULL,
valor NUMERIC(15, 2) NOT NULL,
status_pagamento VARCHAR(20) DEFAULT 'PENDENTE', -- Ex: PENDENTE, PAGO, CANCELADO
CONSTRAINT fk_parcela_cp FOREIGN KEY (id_conta_pagar) REFERENCES conta_pagar (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 7. TABELA: CONTAS A RECEBER
-- ------------------------------------------------------------
CREATE TABLE conta_receber (
id SERIAL PRIMARY KEY,
id_cliente INT NOT NULL,
numero_documento VARCHAR(50),
data_emissao DATE NOT NULL,
descricao TEXT,
valor_total NUMERIC(15, 2) NOT NULL,
data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT fk_conta_receber_cliente FOREIGN KEY (id_cliente) REFERENCES cliente (id)
);

-- Relacionamento N:M (Uma Conta a Receber pode ter um ou mais Tipos de Receita)
CREATE TABLE conta_receber_tipo_receita (
id_conta_receber INT NOT NULL,
id_tipo_receita INT NOT NULL,
PRIMARY KEY (id_conta_receber, id_tipo_receita),
CONSTRAINT fk_cprt_conta FOREIGN KEY (id_conta_receber) REFERENCES conta_receber (id) ON DELETE CASCADE,
CONSTRAINT fk_cprt_receita FOREIGN KEY (id_tipo_receita) REFERENCES tipo_receita (id)
);

-- Tabela de Parcelas (Uma Conta a Receber pode ter uma ou mais parcelas)
CREATE TABLE parcela_conta_receber (
id SERIAL PRIMARY KEY,
id_conta_receber INT NOT NULL,
numero_parcela INT NOT NULL,
data_vencimento DATE NOT NULL,
valor NUMERIC(15, 2) NOT NULL,
status_recebimento VARCHAR(20) DEFAULT 'PENDENTE', -- Ex: PENDENTE, RECEBIDO, CANCELADO
CONSTRAINT fk_parcela_cr FOREIGN KEY (id_conta_receber) REFERENCES conta_receber (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- POPULANDO ALGUNS TIPOS DE DESPESAS INICIAIS (Baseado na especificação)
-- ------------------------------------------------------------
INSERT INTO tipo_despesa (descricao, categoria_pai) VALUES
('Sementes, Fertilizantes e Defensivos', 'INSUMOS AGRÍCOLAS'),
('Combustíveis e Lubrificantes', 'MANUTENÇÃO E OPERAÇÃO'),
('Peças, Parafusos e Componentes', 'MANUTENÇÃO E OPERAÇÃO'),
('Mão de Obra Temporária', 'RECURSOS HUMANOS'),
('Frete e Transporte', 'SERVIÇOS OPERACIONAIS'),
('Energia Elétrica', 'INFRAESTRUTURA E UTILIDADES'),
('Materiais de Construção', 'INFRAESTRUTURA E UTILIDADES'),
('Honorários Contábeis/Advocatícios', 'ADMINISTRATIVAS'),
('Seguro Agrícola', 'SEGUROS E PROTEÇÃO'),
('Impostos e Taxas (ITR/IPVA)', 'IMPOSTOS E TAXAS'),
('Aquisição de Máquinas', 'INVESTIMENTOS');


# script funcionando organizado