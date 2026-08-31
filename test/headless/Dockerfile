FROM archlinux:base

# Refresh the keyring before anything else -- a cached base image with expired
# signing keys is the classic Arch-in-Docker failure mode.
RUN pacman -Sy --noconfirm archlinux-keyring \
 && pacman -Syu --noconfirm \
    gnome-shell \
    gettext \
    zip \
    unzip \
    git \
    nodejs \
    npm \
    dbus \
    at-spi2-core \
    mesa \
    vulkan-swrast \
    xorg-server-xvfb

RUN npm install -g pnpm

WORKDIR /repo
