const socket = io();
const errorDiv = document.getElementById('error');
const studentIdInput = document.getElementById('studentId');

function showError(message) {
    errorDiv.textContent = message;
    setTimeout(() => {
        errorDiv.textContent = '';
    }, 3000);
}

async function loginAsStudent() {
    const studentId = studentIdInput.value.trim();
    
    if (!studentId) {
        showError('Por favor, insere o teu número de aluno');
        return;
    }

    if (!/^\d+$/.test(studentId)) {
        showError('O número de aluno deve conter apenas dígitos');
        return;
    }

    try {
        const response = await fetch('/api/generate-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userType: 'student', studentId })
        });

        const data = await response.json();
        
        if (response.ok && data.token) {
            window.location.href = `/student/${data.token}`;
        } else {
            showError(data.error || 'Erro no login');
        }
    } catch (error) {
        showError('Erro de conexão com o servidor');
    }
}

async function loginAsAdmin() {
    try {
        const response = await fetch('/api/generate-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userType: 'admin' })
        });

        const data = await response.json();
        
        if (response.ok && data.redirect) {
            window.location.href = data.redirect;
        } else {
            showError('Erro no login de administrador');
        }
    } catch (error) {
        showError('Erro de conexão com o servidor');
    }
}

studentIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginAsStudent();
    }
});

window.addEventListener('load', () => {
    studentIdInput.focus();
});