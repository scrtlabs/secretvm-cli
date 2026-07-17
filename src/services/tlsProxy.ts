import yaml from "js-yaml";
import { DockerCompose } from "../types";

/**
 * Returns true if the given docker-compose content already defines a
 * Traefik reverse-proxy service (i.e. it was produced by injectTraefikProxy).
 * Used to guard against silently stripping TLS routing on edit.
 */
export function composeHasTraefik(composeContent: string): boolean {
    try {
        const compose = yaml.load(composeContent) as DockerCompose;
        return Boolean(compose?.services?.traefik);
    } catch {
        return false;
    }
}

/**
 * Wraps every app service in a Traefik reverse proxy that terminates TLS on
 * :443 with Let's Encrypt (ACME TLS-ALPN-01). Shared by `vm create -s` and
 * `vm edit -s`.
 *
 * @param domain When omitted, the app domain is left as the literal
 *   `$DOMAIN_NAME` placeholder, which the platform substitutes at deploy time
 *   (used by create). When provided, the domain is baked into the compose
 *   directly (used by edit, where the VM's domain is already known and we must
 *   not rely on the update path re-substituting `$DOMAIN_NAME`).
 */
export function injectTraefikProxy(
    composeContent: string,
    domain?: string,
): string {
    const domainRef =
        domain && domain.trim() !== "" ? domain.trim() : "$DOMAIN_NAME";
    const dockerCompose = yaml.load(composeContent) as DockerCompose;

    // Create traefik network if it doesn't exist
    if (!dockerCompose.networks) {
        dockerCompose.networks = {};
    }
    dockerCompose.networks.traefik = {
        driver: "bridge",
    };

    // Add Traefik service
    dockerCompose.services.traefik = {
        image: "traefik:v2.10",
        command: [
            "--providers.docker=true",
            "--providers.docker.exposedbydefault=false",
            "--entrypoints.web.address=:80",
            "--entrypoints.websecure.address=:443",
            "--certificatesresolvers.myresolver.acme.tlschallenge=true",
            `--certificatesresolvers.myresolver.acme.email=admin@${domainRef}`,
            "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json",
        ],
        ports: ["80:80", "443:443"],
        volumes: [
            "/var/run/docker.sock:/var/run/docker.sock:ro",
            "./letsencrypt:/letsencrypt",
        ],
        networks: ["traefik"],
        labels: {
            // Do NOT route the Traefik container itself. Traefik is a pure
            // reverse proxy here; a router without a `rule` would fall back to
            // its default rule Host(`<container-name>`), and — with a
            // certresolver attached — try to obtain an ACME certificate for
            // that single-label name, which Let's Encrypt rejects
            // ("Domain name needs at least one dot").
            "traefik.enable": "false",
        },
    };

    // Add Traefik labels to all other services
    Object.keys(dockerCompose.services).forEach((serviceName) => {
        if (serviceName !== "traefik") {
            const service = dockerCompose.services[serviceName];

            if (!service.networks) {
                service.networks = [];
            }
            if (!service.networks.includes("traefik")) {
                service.networks.push("traefik");
            }

            if (!service.labels) {
                service.labels = {};
            }

            service.labels = {
                ...service.labels,
                "traefik.enable": "true",
                [`traefik.http.routers.${serviceName}.rule`]: `Host(\`${domainRef}\`)`,
                [`traefik.http.routers.${serviceName}.entrypoints`]:
                    "websecure",
                [`traefik.http.routers.${serviceName}.tls.certresolver`]:
                    "myresolver",
                [`traefik.http.services.${serviceName}.loadbalancer.server.port`]:
                    "80",
            };
        }
    });

    return yaml.dump(dockerCompose);
}
