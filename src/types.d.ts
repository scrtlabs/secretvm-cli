export interface VmTypeInfo {
    id: string;
    type: string;
    cpu: number;
    ram: number;
    disk: number;
    traffic: number;
    pricePerHour: number;
    createdAt: string;
    updatedAt: string;
}

export interface HostInfo {
    id: string;
    port: number;
    host: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface CsrfResponse {
    csrfToken: string;
}

export interface KeplrLoginResponse {
    url?: string;
}

export interface AuthSession {
    user?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
        sub?: string;
    };
    expires?: string;
}

export interface VmInstance {
    id: string;
    vmId: string;
    name: string;
    nameFromUser?: string;
    user: string;
    vmTypeId: string;
    hostId: string;
    ip_address: string | null;
    vmDomain?: string | null;
    createdAt: string;
    updatedAt: string;
    status: string;
    state: string;
    vmType: VmTypeInfo;
    host: HostInfo;
    docker_file?: string | null;
    secret_fs_persistent?: boolean;
    kmsProvider?: string;
}

export interface Template {
    id: string;
    name: string;
    description: string;
    instructions: string;
    tags: string[];
    submittedBy: string;
    link: string;
    docker: string;
    defaultVmSize: string;
    createdAt: string;
    updatedAt: string;
}

export type CreateVmApiResponse = VmInstance;

export interface StopVmApiResponse {
    status: string;
    message?: string;
    data?: any;
}

export interface RemoveVmApiResponse {
    status: string;
    message?: string;
    details?: any;
}

export interface StartVmApiResponse {
    status: string;
    message?: string;
    data?: {
        vm_name?: string;
        ip_address?: string;
        [key: string]: any;
    };
}

export interface VmDetailsApiResponse {
    id: string;
    vmId: string;
    name: string;
    nameFromUser: string | null;
    state: string;
    status: string;
    user: string;
    vmTypeId: string;
    hostId: string;
    memory: number;
    vcpus: number;
    disk_size: number;
    created_at: string;
    updated_at: string;
    ip_address: string | null;
    vmDomain: string | null;
    gateway: string | null;
    network_bridge: string | null;
    network_is_tap: boolean | null;
    network_ports: any;
    docker_file: string | null;
    vmType: VmTypeInfo;
    host: HostInfo;
}

export interface GlobalOptions {
    interactive: boolean;
    apiKey?: string;
}

export interface LoginCommandOptions {
    walletAddress?: string;
    signature?: string;
}

export interface CreateVmCommandOptions {
    name?: string;
    type?: string;
    dockerCompose?: string;
    template?: string;
    inviteCode?: string;
    tls?: boolean;
    env?: string;
    domain?: string;
    dockerCredentials?: string;
    dockerRegistry?: string;
    persistence?: boolean;
    upgradeability?: boolean;
    private?: boolean;
    platform?: string;
    environment?: string;
    archive?: string;
    kms?: string;
    eip8004RegistrationJson?: string;
    eip8004Chain?: string;
}

export interface EditVmCommandOptions {
    name?: string;
    dockerCompose?: string;
    env?: string;
    persistence?: boolean;
    dockerCredentials?: string;
    dockerRegistry?: string;
    kms?: string;
}

export interface VerifyQuoteCommandOptions {
    quote?: string;
    quoteFile?: string;
    vmId?: string;
    attestationType?: string;
    environment?: string;
    baseUrl?: string;
}

export interface VerifyWorkloadCommandOptions extends VerifyQuoteCommandOptions {
    dockerCompose?: string;
    dockerFiles?: string;
    dockerFilesSha256?: string;
}

export interface VerifyProofOfCloudCommandOptions {
    quote?: string;
    quoteFile?: string;
    vmId?: string;
    environment?: string;
    baseUrl?: string;
}

export interface DockerCompose {
    version?: string;
    services: {
        [key: string]: Service;
    };
    networks?: Networks;
}

interface Service {
    image?: string;
    command?: string[];
    ports?: string[];
    volumes?: string[];
    networks?: string[] | { [key: string]: any };
    labels?: { [key: string]: string };
    environment?: { [key: string]: string } | string[];
    [key: string]: any;
}

interface Networks {
    [key: string]: any;
}
