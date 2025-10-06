const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

function checkDataFiles() {
  console.log('🔍 Verificando ficheiros de dados...\n');
  
  // Verificar diretório
  if (fs.existsSync(DATA_DIR)) {
    console.log('✅ Diretório data/ existe');
  } else {
    console.log('❌ Diretório data/ não existe');
    return;
  }
  
  // Verificar submissões
  if (fs.existsSync(SUBMISSIONS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
      const students = Object.keys(data);
      const totalSubmissions = Object.values(data).reduce((total, submissions) => total + submissions.length, 0);
      
      console.log('📚 Submissões:');
      console.log(`   - Ficheiro: ${SUBMISSIONS_FILE}`);
      console.log(`   - Estudantes: ${students.length}`);
      console.log(`   - Total de submissões: ${totalSubmissions}`);
      
      if (students.length > 0) {
        console.log('   - Estudantes com submissões:', students.join(', '));
      }
    } catch (error) {
      console.log('❌ Erro ao ler submissões:', error.message);
    }
  } else {
    console.log('📚 Submissões: Nenhum ficheiro encontrado');
  }
  
  // Verificar chats
  if (fs.existsSync(CHATS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
      const students = Object.keys(data);
      const totalMessages = Object.values(data).reduce((total, messages) => total + messages.length, 0);
      
      console.log('💬 Chats:');
      console.log(`   - Ficheiro: ${CHATS_FILE}`);
      console.log(`   - Conversas: ${students.length}`);
      console.log(`   - Total de mensagens: ${totalMessages}`);
      
      if (students.length > 0) {
        console.log('   - Estudantes com mensagens:', students.join(', '));
      }
    } catch (error) {
      console.log('❌ Erro ao ler chats:', error.message);
    }
  } else {
    console.log('💬 Chats: Nenhum ficheiro encontrado');
  }
  
  console.log('\n✨ Verificação concluída!');
}

// Executar verificação
checkDataFiles();