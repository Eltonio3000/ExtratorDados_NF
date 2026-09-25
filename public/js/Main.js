// Exibe as informações do ficheiro selecionado no ecrã
function mostrarPreviewArquivo() {
    const input = document.getElementById('pdfInput');
    const preview = document.getElementById('filePreview');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');

    if (input.files && input.files[0]) {
        const file = input.files[0];
        fileName.textContent = file.name;

        // Converte o tamanho para MB com 2 casas decimais
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        fileSize.textContent = `${sizeInMB} MB`;

        preview.style.display = 'flex';
    } else {
        preview.style.display = 'none';
    }
}

// Requisição para a API Node.js / Express
async function enviarPDF() {
    const fileInput = document.getElementById('pdfInput');
    const jsonOutput = document.getElementById('jsonOutput');
    const btnExtrair = document.getElementById('btnExtrair');

    if (!fileInput.files[0]) {
        alert('Por favor, selecione um ficheiro PDF primeiro!');
        return;
    }

    const formData = new FormData();
    formData.append('pdfFile', fileInput.files[0]);

    // Estado de carregamento
    btnExtrair.disabled = true;
    btnExtrair.innerText = "⏳ EXTRAINDO DADOS COM IA...";
    jsonOutput.textContent = "A processar nota fiscal com o Gemini, aguarde...";

    try {
        const response = await fetch('/api/extrair-pdf', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Erro no servidor: ${response.statusText}`);
        }

        const data = await response.json();
        jsonOutput.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        console.error(err);
        jsonOutput.textContent = "Erro ao extrair dados da nota fiscal. Verifique se o servidor está em execução.";
    } finally {
        btnExtrair.disabled = false;
        btnExtrair.innerHTML = "◉ &nbsp; EXTRAIR DADOS";
    }
}

// Copiar conteúdo da caixa JSON
function copiarJSON() {
    const jsonText = document.getElementById('jsonOutput').textContent;

    if (!jsonText || jsonText.startsWith("//") || jsonText.startsWith("A processar")) {
        alert("Não existem dados JSON válidos para copiar.");
        return;
    }

    navigator.clipboard.writeText(jsonText).then(() => {
        alert("JSON copiado para a área de transferência!");
    }).catch(err => {
        console.error("Erro ao copiar: ", err);
    });
}