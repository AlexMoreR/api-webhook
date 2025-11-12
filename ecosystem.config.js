// ecosystem.config.js  
module.exports = {  
  apps: [{  
    name: 'api-webhookCluster',  
    script: 'dist/main.js',  
    instances: 10, 
    // Archivos de logs unificados:
    error_file: '/root/.pm2/logs/allErrors.log',
    out_file: '/root/.pm2/logs/allOuts.log',
    merge_logs: true, // Esto es clave para unificar
    exec_mode: 'cluster',  
    max_memory_restart: '1G',  
    env: {  
      NODE_ENV: 'production',  
      PORT: 5001  // UN SOLO PUERTO  
    }  
  }]  
};