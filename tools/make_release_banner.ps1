param(
    [string]$Name = '',
    [string]$Version = 'CONCEPT',
    [string]$Out = '',
    [ValidateSet('blue', 'orange', 'green')][string]$Palette = 'blue',
    [switch]$Batch
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
if ($Batch) {
    if (!$Out) { $Out = Join-Path $root 'build/future-banners' }
    foreach ($choice in @('blue', 'orange', 'green')) {
        & $PSCommandPath -Palette $choice -Version 'FUTURE CONCEPT' -Out (Join-Path $Out "$choice-bear.png")
    }
    return
}
$presets = @{
    blue = @('Ceruleanish Ear Bear', '#8dc4ed')
    orange = @('Amberish Ear Bear', '#efb16b')
    green = @('Jadeish Ear Bear', '#91cbb1')
}
if (!$Name) { $Name = $presets[$Palette][0] }
if (!$Out) { $Out = Join-Path $root 'build/release-banner.png' }
$Out = [System.IO.Path]::GetFullPath($Out)
if (Test-Path -LiteralPath $Out) { throw "Output exists; choose a new -Out path: $Out" }
$headPath = Join-Path $PSScriptRoot 'viewer/assets/icon.png'
$bitmap = New-Object System.Drawing.Bitmap 1500,500
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$head = [System.Drawing.Image]::FromFile($headPath)
$resources = [System.Collections.Generic.List[System.IDisposable]]::new()
try {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#111b29'))
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    function Brush($hex) {
        $b = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex))
        $resources.Add($b)
        return $b
    }
    function Font($size, $style) {
        $f = [System.Drawing.Font]::new('Segoe UI', [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
        $resources.Add($f)
        return $f
    }
    $accent = Brush $presets[$Palette][1]
    $white = Brush '#f2f4f7'
    $muted = Brush '#9ba9b9'
    $small = Font 21 ([System.Drawing.FontStyle]::Regular)
    $graphics.FillRectangle($accent, 70, 76, 32, 3)
    $graphics.DrawString('SSSV MODKIT', $small, $accent, 70, 100)
    $size = 60
    $caption = '"' + $Name + '" edition'
    $format = [System.Drawing.StringFormat]::GenericTypographic
    $resources.Add($format)
    do {
        $title = Font $size ([System.Drawing.FontStyle]::Bold -bor [System.Drawing.FontStyle]::Italic)
        if ($graphics.MeasureString($caption, $title, 2000, $format).Width -le 890) { break }
        $size--
    } while ($size -gt 12)
    $graphics.DrawString($caption, $title, $white, [System.Drawing.PointF]::new(70, 205), $format)
    $graphics.DrawString($Version, $small, $muted, 70, 315)
    $scale = [Math]::Min(340 / $head.Width, 340 / $head.Height)
    $rect = [System.Drawing.RectangleF]::new(1230 - $head.Width*$scale/2, 250 - $head.Height*$scale/2, $head.Width*$scale, $head.Height*$scale)
    $graphics.DrawImage($head, $rect)
    [System.IO.Directory]::CreateDirectory((Split-Path $Out -Parent)) | Out-Null
    $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Banner saved: $Out"
} finally {
    foreach ($resource in $resources) { $resource.Dispose() }
    $head.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
