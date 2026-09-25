
document.getElementById('formUser').addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('nome').value;
    const email = document.getElementById('email').value;

    try {
        const response = await fetch('/api/CreateUser', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nome, email })
        });

        const resultado = await response.json();

        if (resultado.sucesso) {
            localStorage.setItem('usuarioLogado', JSON.stringify(resultado.usuario || { nome, email }));
            alert('Usuário cadastrado com sucesso!');
            window.location.href = '/JoinRoom';
        } else {
            alert('Erro ao cadastrar: ' + resultado.erro);
        }
    } catch (error) {
        console.error('Erro na requisição:', error);
    }
});


document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;

    try {
        const response = await fetch('/api/LoginUser', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const resultado = await response.json();

        if (resultado.sucesso) {
            // Guarda os dados do usuário logado no navegador para usar depois
            localStorage.setItem('usuarioLogado', JSON.stringify(resultado.usuario));

            window.location.href = '/JoinRoom';
        } else {
            alert(resultado.erro);
        }
    } catch (error) {
        console.error('Erro na autenticação:', error);
    }
});