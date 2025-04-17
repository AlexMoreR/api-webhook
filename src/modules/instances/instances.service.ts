import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class InstancesService {
    constructor(private readonly prisma: PrismaService) { }

    // Get a specific userId by instanceId
    async getUserId(instanceName: string) {
        return this.prisma.instancias.findFirst({
            where: {
                instanceName
            },
        });
    }
}
