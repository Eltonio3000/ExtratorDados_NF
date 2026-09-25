import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODELOS_DISPONIVEIS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
];

export async function processarNotaFiscalPDF(caminhoArquivo) {
  // Converte o arquivo local em Buffer/Base64 para o Gemini
  const pdfBuffer = fs.readFileSync(caminhoArquivo);
  const pdfBase64 = pdfBuffer.toString('base64');

  const prompt = `
    Você é um extrator de dados de Notas Fiscais.
    Analise o PDF anexado e extraia os dados estritamente no formato JSON solicitado.
    Você deve extrair as seguintes informações no PDF
    
    Fornecedor
      Razão Social
      Nome Fantasia
      CNPJ

    Faturado
      Nome Completo
      CPF
    Número da Nota Fiscal
    Data de Emissão
    Descrição dos produtos
    Quantidade de Parcelas
    Data de Vencimento
    ValorTotal
    Classificação da DESPESA
    
    Classifique a DESPESA com base nos itens da nota seguindo estas categorias:
    - INSUMOS AGRÍCOLAS 
        Sementes, Fertilizantes, Defensivos Agrícolas, Corretivos
    - MANUTENÇÃO E OPERAÇÃO
        Combustíveis e Lubrificantes
        Peças, Parafusos, Componentes Mecânicos
        Manutenção de Máquinas e Equipamentos
        Pneus, Filtros, Correias
        Ferramentas e Utensílios
    - RECURSOS HUMANOS
        Mão de Obra Temporária
        Salários e Encargos
    - SERVIÇOS OPERACIONAIS
        Frete e Transporte
        Colheita Terceirizada
        Secagem e Armazenagem
        Pulverização e Aplicação
    - INFRAESTRUTURA E UTILIDADES
        Energia Elétrica
        Arrendamento de Terras
        Construções e Reformas
        Materiais de Construção
    - ADMINISTRATIVAS
        Honorários (Contábeis, Advocatícios, Agronômicos)
        Despesas Bancárias e Financeiras
    - SEGUROS E PROTEÇÃO
        Seguro Agrícola
        Seguro de Ativos (Máquinas/Veículos)
        Seguro Prestamista
    - IMPOSTOS E TAXAS
        ITR, IPTU, IPVA, INCRA-CCIR
    - INVESTIMENTOS
        Aquisição de Máquinas e Implementos
        Aquisição de Veículos
        Aquisição de Imóveis
        Infraestrutura Rural
  `;

  // Esquema de resposta estruturada em JSON
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      fornecedor: {
        type: Type.OBJECT,
        properties: {
          razaoSocial: { type: Type.STRING },
          nomeFantasia: { type: Type.STRING },
          cnpj: { type: Type.STRING }
        },
        required: ["razaoSocial", "nomeFantasia", "cnpj"]
      },
      faturado: {
        type: Type.OBJECT,
        properties: {
          nomeCompleto: { type: Type.STRING },
          cpf: { type: Type.STRING }
        },
        required: ["nomeCompleto", "cpf"]
      },
      numeroNotaFiscal: { type: Type.STRING },
      dataEmissao: { type: Type.STRING },
      descricaoProdutos: { type: Type.STRING },
      quantidadeParcelas: { type: Type.INTEGER },
      dataVencimento: { type: Type.STRING },
      valorTotal: { type: Type.NUMBER },
      classificacaoDespesa: { type: Type.STRING }
    },
    required: [
      "fornecedor",
      "faturado",
      "numeroNotaFiscal",
      "dataEmissao",
      "descricaoProdutos",
      "quantidadeParcelas",
      "dataVencimento",
      "valorTotal",
      "classificacaoDespesa"
    ]
  };

  let ultimoErro = null;

  for (const modelo of MODELOS_DISPONIVEIS) {
    try {
      console.log(`[Gemini API] Tentando processar PDF com o modelo: ${modelo}`);
        const response = await ai.models.generateContent({
          model: modelo,
          contents: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64
              }
            },
            prompt
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema
          }
        });

      console.log(`[Gemini API] Sucesso no processamento utilizando: ${modelo}`);
      return JSON.parse(response.text);
      } catch (error) {
      ultimoErro = error;
      console.warn(`[Gemini API] Falha no modelo ${modelo}. Erro (${error?.status || 'API Error'}): ${error.message}`);
      console.log('[Gemini API] Alternando para o próximo modelo de fallback...');
    }
  }
    throw new Error(`Falha ao extrair dados do PDF em todos os modelos tentados. Último erro: ${ultimoErro?.message}`);
}
