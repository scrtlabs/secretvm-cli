#!/usr/bin/env node

import { Command } from "commander";
import {
    loginCommand,
    logoutCommand,
    statusCommand,
    listVmsCommand,
    createVmCommand,
    vmLogsCommand,
    vmAttestationCommand,
    stopVmCommand,
    startVmCommand,
    removeVmCommand,
    vmStatusCommand,
} from "./commands";

async function main() {
    const program = new Command();

    program
        .name("secretai-devportal-cli")
        .description("CLI tool for SecretAI devportal")
        .version("0.1.0");

    const authCommands = new Command("auth").description("Auth commands");
    authCommands
        .command("login")
        .description("Login to the service using Keplr wallet")
        .action(loginCommand);
    authCommands
        .command("logout")
        .description("Logout from the service and clear session")
        .action(logoutCommand);
    program.addCommand(authCommands);

    program
        .command("status")
        .description("Check current login status")
        .action(statusCommand);

    const vmCommands = new Command("vm").description("VM commands");
    vmCommands
        .command("list")
        .alias("ls")
        .description("List all virtual machine instances")
        .action(listVmsCommand);
    vmCommands
        .command("create")
        .description("Create new virtual machine")
        .action(createVmCommand);
    vmCommands
        .command("stop")
        .argument("<vmId>")
        .description("Stop virtual machine")
        .action((vmId: string) => {
            stopVmCommand(vmId);
        });
    vmCommands
        .command("start")
        .argument("<vmId>")
        .description("Start virtual machine")
        .action((vmId: string) => {
            startVmCommand(vmId);
        });
    vmCommands
        .command("remove")
        .argument("<vmId>")
        .description("Remove virtual machine")
        .action((vmId: string) => {
            removeVmCommand(vmId);
        });
    vmCommands
        .command("logs")
        .description("View logs of the specified virtual machine")
        .argument("<vmId>")
        .action((vmId: string) => {
            vmLogsCommand(vmId);
        });
    vmCommands
        .command("attestation")
        .description("View CPU attestation of the specified virtual machine")
        .argument("<vmId>")
        .action((vmId: string) => {
            vmAttestationCommand(vmId);
        });
    vmCommands
        .command("status")
        .description("View virtual machine status")
        .argument("<vmUUID>")
        .action((vmId: string) => {
            vmStatusCommand(vmId);
        });
    program.addCommand(vmCommands);

    await program.parseAsync(process.argv);
}

main().catch((err) => {
    console.error("Unhandled error in main execution:", err);
    process.exit(1);
});
