import { Module } from "@nestjs/common";
import { WebhookModule } from "../../webhook.module";
import { WebhookOrchestatorService } from "./WebhookOrchestator.service";
import { UserService } from "src/modules/user/user.service";
import { InstancesService } from "src/modules/instances/instances.service";

@Module({
    imports:[],
    providers:[],
    exports:[WebhookOrchestatorService],
})
export class WebhookOrchestatorModule{}