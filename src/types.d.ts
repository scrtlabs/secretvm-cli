export interface VmTypeInfo {
    type: string;
    cpu: number;
    ram: number;
    disk: number;
    traffic: number;
    pricePerHour: number;
    price?: number;
}

export interface HostInfo {
    host: string;
    port: number;
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
}

export type CreateVmApiResponse = VmInstance;
