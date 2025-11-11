// ecosystem.config.js  
module.exports = {  
  apps: [{  
    name: 'api-webhook',  
    script: 'dist/main.js',  
    instances: 10,  // 10 procesos compartiendo el puerto 5001  
    exec_mode: 'cluster',  
    max_memory_restart: '1G',  
    env: {  
      NODE_ENV: 'production',  
      PORT: 5001  // UN SOLO PUERTO  
    }  
  }]  
};