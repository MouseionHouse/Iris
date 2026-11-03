#pragma once

#include <QObject>

// Whether Plasma (through Qt's platform theme) is on a dark colour scheme, and when that changes.
class ColorSchemeWatcher : public QObject
{
    Q_OBJECT
public:
    explicit ColorSchemeWatcher(QObject *parent = nullptr);

    bool dark() const { return m_dark; }

    // The scheme Qt reports; when it reports none, the lightness of the window background.
    static bool systemIsDark();

Q_SIGNALS:
    void darkChanged(bool dark);

private:
    void refresh();
    bool m_dark;
};
