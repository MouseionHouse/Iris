#include "colorscheme.h"

#include <QGuiApplication>
#include <QPalette>
#include <QStyleHints>

ColorSchemeWatcher::ColorSchemeWatcher(QObject *parent)
    : QObject(parent)
    , m_dark(systemIsDark())
{
    connect(QGuiApplication::styleHints(), &QStyleHints::colorSchemeChanged, this, &ColorSchemeWatcher::refresh);
    // Plasma changes the palette on a scheme switch even when the hint stays Unknown.
    connect(qGuiApp, &QGuiApplication::paletteChanged, this, &ColorSchemeWatcher::refresh);
}

bool ColorSchemeWatcher::systemIsDark()
{
    switch (QGuiApplication::styleHints()->colorScheme()) {
    case Qt::ColorScheme::Dark:
        return true;
    case Qt::ColorScheme::Light:
        return false;
    default:
        return QGuiApplication::palette().color(QPalette::Window).lightness() < 128;
    }
}

void ColorSchemeWatcher::refresh()
{
    const bool now = systemIsDark();
    if (now == m_dark)
        return;
    m_dark = now;
    Q_EMIT darkChanged(now);
}
