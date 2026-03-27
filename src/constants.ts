export const KMS_CONTRACT_PUBLIC_KEY =
    process.env.KMS_CONTRACT_PUBLIC_KEY ??
    "4351c6cb98337d7b834ebb00667993b473151f14038e2ae125070eb4fb58d271";

export const API_ENDPOINTS = {
    AUTH: {
        CSRF: "/api/auth/csrf",
        KEPLR_CALLBACK: "/api/auth/callback/keplr",
        SESSION: "/api/auth/session",
    },
    VM: {
        INSTANCES: "/api/vm/instances",
        TEMPLATES: "/api/templates",
        CREATE: "/api/vm/create",
        DETAILS: (vmId: string) => `/api/vm/${vmId}`,
        STOP: (vmId: string) => `/api/vm/${vmId}/stop`,
        START: (vmId: string) => `/api/vm/${vmId}/start`,
        TERMINATE: (vmId: string) => `/api/vm/${vmId}/terminate`,
        LOGS: (vmId: string) => `/api/vm/${vmId}/docker_logs`,
        CPU_ATTESTATION: (vmId: string) => `/api/vm/${vmId}/cpu`,
        LAUNCH: (vmId: string) => `/api/vm/${vmId}/launch`,
        UPDATE_BACKGROUND: (vmId: string) => `/api/vm/${vmId}/update-background`,
    },
    JOB: {
        STATUS: (jobId: string) => `/api/background-job/${jobId}`,
    },
};
