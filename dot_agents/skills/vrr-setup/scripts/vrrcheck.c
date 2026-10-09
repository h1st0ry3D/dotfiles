/*
 * vrrcheck — read live DRM VRR properties from the kernel.
 *
 * Reports VRR_CAPABLE (connector) and VRR_ENABLED (CRTC) so you can confirm
 * the driver actually committed VRR rather than trusting compositor output.
 *
 * MUST be run as root (or as the DRM master). The kernel restricts
 * drmModeObjectGetProperties to DRM master / CAP_SYS_ADMIN, so unprivileged
 * runs print nothing at all. That is the kernel enforcing a boundary, not a bug.
 *
 * Build:  gcc -O2 -o vrrcheck vrrcheck.c $(pkg-config --cflags --libs libdrm)
 * Run:    sudo ./vrrcheck /dev/dri/card1
 *
 * libdrm note: on 2.4.134 the connector struct no longer carries `name` or
 * `crtc_id`; both come from properties ("NAME" blob, "CRTC_ID") and the struct
 * fields for blobs were renamed to count_blobs / blob_ids.
 */
#include <stdio.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdint.h>
#include <xf86drm.h>
#include <xf86drmMode.h>

static uint32_t get_prop(int fd, uint32_t obj_id, uint32_t type,
                         const char* want, uint64_t* out) {
    drmModeObjectProperties* props = drmModeObjectGetProperties(fd, obj_id, type);
    if (!props) return 0;
    uint32_t found = 0;
    for (uint32_t i = 0; i < props->count_props; i++) {
        drmModePropertyRes* p = drmModeGetProperty(fd, props->props[i]);
        if (!p) continue;
        if (!strcmp(p->name, want)) { *out = props->prop_values[i]; found = 1; }
        drmModeFreeProperty(p);
    }
    drmModeFreeObjectProperties(props);
    return found;
}

static void connector_name(int fd, uint32_t conn_id, char* buf, size_t len) {
    snprintf(buf, len, "?");
    drmModeObjectProperties* props =
        drmModeObjectGetProperties(fd, conn_id, DRM_MODE_OBJECT_CONNECTOR);
    if (!props) return;
    for (uint32_t i = 0; i < props->count_props; i++) {
        drmModePropertyRes* p = drmModeGetProperty(fd, props->props[i]);
        if (!p) continue;
        if (!strcmp(p->name, "NAME") && p->count_blobs > 0) {
            drmModePropertyBlobPtr b = drmModeGetPropertyBlob(fd, props->prop_values[i]);
            if (b) { snprintf(buf, len, "%s", (char*)b->data); drmModeFreePropertyBlob(b); }
        }
        drmModeFreeProperty(p);
    }
    drmModeFreeObjectProperties(props);
}

static void decode_caps(uint64_t v) {
    printf(" [");
    if (v & (1 << 0)) printf("VRR ");
    if (v & (1 << 1)) printf("ADAPTIVE_SYNC ");
    if (v & (1 << 2)) printf("ADAPTIVE_SYNC_PLUS ");
    if (v & (1 << 3)) printf("DISCONNECT ");
    if (v & (1 << 4)) printf("LINKED_CRTC ");
    if (v & (1 << 7)) printf("BIT7 ");
    printf("]");
}

static void decode_enabled(uint64_t v) {
    printf(" [");
    if (v & (1 << 0)) printf("VRR ");
    if (v & (1 << 1)) printf("ADAPTIVE_SYNC ");
    if (v & (1 << 2)) printf("ALWAYS_ON ");
    if (v & (1 << 3)) printf("ON_DEMAND ");
    if (v & (1 << 4)) printf("CURRENT ");
    printf("]");
}

int main(int argc, char** argv) {
    const char* path = argc > 1 ? argv[1] : "/dev/dri/card0";

    int fd = open(path, O_RDWR);
    if (fd < 0) { perror("open"); return 1; }

    drmModeRes* res = drmModeGetResources(fd);
    if (!res) {
        fprintf(stderr, "drmModeGetResources failed.\n"
                        "Unprivileged? DRM property reads need root or the DRM master.\n");
        return 1;
    }

    printf("=== %s ===\n", path);
    int any = 0, saw_connector = 0;

    for (int c = 0; c < res->count_connectors; c++) {
        uint32_t cid = res->connectors[c];
        uint64_t caps = 0, crtc = 0;

        if (!get_prop(fd, cid, DRM_MODE_OBJECT_CONNECTOR, "CRTC_ID", &crtc))
            continue;                       /* property read refused outright */
        saw_connector = 1;

        if (crtc == 0) continue;            /* connector genuinely has no CRTC */

        char name[64];
        connector_name(fd, cid, name, sizeof(name));

        if (!get_prop(fd, cid, DRM_MODE_OBJECT_CONNECTOR, "VRR_CAPABLE", &caps)) continue;

        printf("connector %s\n", name);
        printf("  VRR_CAPABLE = %llu", (unsigned long long)caps);
        decode_caps(caps);
        if (!(caps & ((1 << 0) | (1 << 1) | (1 << 2))))
            printf("   <-- no VRR advertised, EDID likely lacks the vendor VSDB\n");
        any = 1;

        uint64_t en = 0;
        if (get_prop(fd, (uint32_t)crtc, DRM_MODE_OBJECT_CRTC, "VRR_ENABLED", &en)) {
            printf("  VRR_ENABLED = %llu", (unsigned long long)en);
            decode_enabled(en);
            printf("   %s\n", (en & 0x1F) ? "<-- VRR ACTIVE" : "<-- VRR NOT enabled");
        } else {
            printf("  VRR_ENABLED = <property absent>\n");
        }

        drmModeCrtc* cr = drmModeGetCrtc(fd, (uint32_t)crtc);
        if (cr) {
            drmModeModeInfo* m = &cr->mode;
            if (m->htotal && m->vtotal)
                printf("  mode: %dx%d @ %.3f Hz  (%.1f MHz pixel clock)\n",
                       m->hdisplay, m->vdisplay,
                       (double)m->clock / ((double)m->htotal * m->vtotal),
                       m->clock / 1000.0);
            drmModeFreeCrtc(cr);
        }
    }

    if (!saw_connector)
        printf("\nNo connector properties were readable.\n"
               "This almost always means you lack DRM master: the kernel restricts\n"
               "drmModeObjectGetProperties to the DRM master or CAP_SYS_ADMIN.\n"
               "Re-run under sudo.\n");
    else if (!any)
        printf("\nNo connector on this device advertises VRR_CAPABLE.\n"
               "Likely cause: the monitor's EDID has no vendor FreeSync/Adaptive-Sync\n"
               "VSDB. Decode it with: edid-decode /sys/class/drm/<card>-<conn>/edid\n");

    drmModeFreeResources(res);
    close(fd);
    return 0;
}