export const tools: any[] = [
    {
        type: 'function',
        function: {
            name: 'notificacion',
            description: 'Utiliza esta herramienta cuando un usuario necesite la asesoría de un asesor, haga una solicitud, reclamo o agendamiento.',
            parameters: {
                type: 'object',
                properties: {
                    nombre: { type: 'string', description: 'Nombre del usuario' },
                    detalles: { type: 'string', description: 'Detalle de la notificación o solicitud' },
                },
                required: ['nombre', 'detalles'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'execute_workflow',
            description: `Utiliza siempres esta herramienta debe ejecutarse para verificar si existe un flujo automatizado en la base de datos relacionado 
        con la intención del usuario. Si se encuentra un flujo coincidente, se ejecuta automáticamente. Si no se encuentra ningún flujo, la IA debe continuar 
        la conversación de forma natural sin interrumpir al usuario.`,
            parameters: {
                type: 'object',
                properties: {
                    nombre_flujo: {
                        type: 'string',
                        description: 'Nombre del flujo a ejecutar',
                    },
                },
                required: ['nombre_flujo'],
            },
        },
    }
];