param(
    [string]$Name = '',
    [string]$Version = 'CONCEPT',
    [string]$Out = '',
    [ValidateSet('blue', 'orange', 'green')][string]$Palette = 'blue',
    [ValidateSet('random', 'english', 'french', 'spanish', 'german', 'japanese')][string]$QuoteStyle = 'random',
    [ValidateSet('original', 'head', 'ears', 'both')][string]$Recolor = 'both',
    [switch]$Batch
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
if ($Batch) {
    if (!$Out) { $Out = Join-Path $root 'build/future-banners' }
    foreach ($choice in @('blue', 'orange', 'green')) {
        & $PSCommandPath -Palette $choice -QuoteStyle $QuoteStyle -Recolor $Recolor -Version 'FUTURE CONCEPT' -Out (Join-Path $Out "$choice-bear.png")
    }
    return
}
$presets = @{
    blue = @('Ceruleanish Ear Bear', '#8dc4ed')
    orange = @('Amberish Ear Bear', '#efb16b')
    green = @('Jadeish Ear Bear', '#91cbb1')
}
if (!$Name) { $Name = $presets[$Palette][0] }
$quotes = @{
    english = @([string][char]0x201C, [string][char]0x201D)
    french = @(([string][char]0x00AB + [char]0x202F), ([string][char]0x202F + [char]0x00BB))
    spanish = @([string][char]0x00AB, [string][char]0x00BB)
    german = @([string][char]0x201E, [string][char]0x201C)
    japanese = @([string][char]0x300C, [string][char]0x300D)
}
if ($QuoteStyle -eq 'random') { $QuoteStyle = Get-Random -InputObject @('english', 'french', 'spanish', 'german', 'japanese') }
if (!$Out) { $Out = Join-Path $root 'build/release-banner.png' }
$Out = [System.IO.Path]::GetFullPath($Out)
if (Test-Path -LiteralPath $Out) { throw "Output exists; choose a new -Out path: $Out" }
$headPath = Join-Path $PSScriptRoot 'viewer/assets/icon.png'
$bitmap = New-Object System.Drawing.Bitmap 1500,500
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$head = [System.Drawing.Image]::FromFile($headPath)
$render = [System.Drawing.Bitmap]::new($head)
$resources = [System.Collections.Generic.List[System.IDisposable]]::new()
try {
    # Masks are specific to the verified 256px bear raster, not generic anatomy.
    $target = [System.Drawing.ColorTranslator]::FromHtml($presets[$Palette][1])
    if ($Recolor -ne 'original') {
        for ($y = 0; $y -lt $render.Height; $y++) {
            for ($x = 0; $x -lt $render.Width; $x++) {
                $pixel = $head.GetPixel($x, $y)
                if (!$pixel.A) { continue }
                $fur = $pixel.B -gt ($pixel.R * 1.5) -and $pixel.B -gt ($pixel.G * 1.25)
                $ear = $y -lt 40 -and $pixel.R -gt $pixel.B -and $pixel.G -ge $pixel.B
                $factor = 0
                if ($fur -and $Recolor -in @('head', 'both')) { $factor = 0.65 * $pixel.B / 128 }
                if ($ear -and $Recolor -in @('ears', 'both')) { $factor = 0.9 * [Math]::Max($pixel.R, $pixel.G) / 200 }
                if ($factor -gt 0) {
                    $render.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A,
                        [int][Math]::Min(255, $target.R * $factor),
                        [int][Math]::Min(255, $target.G * $factor),
                        [int][Math]::Min(255, $target.B * $factor)))
                }
            }
        }
    }
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#111b29'))
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    function Brush($hex) {
        $b = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex))
        $resources.Add($b)
        return $b
    }
    function Font($size, $style, $family = 'Segoe UI') {
        $f = [System.Drawing.Font]::new($family, [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
        $resources.Add($f)
        return $f
    }
    $accent = Brush $presets[$Palette][1]
    $muted = Brush '#9ba9b9'
    $rule = Brush '#26384b'
    $small = Font 21 ([System.Drawing.FontStyle]::Regular)
    $graphics.FillRectangle($accent, 70, 76, 32, 3)
    $graphics.DrawString('SSSV MODKIT', $small, $accent, 70, 100)
    $graphics.FillRectangle($rule, 70, 382, 890, 1)
    $graphics.FillRectangle($accent, 70, 382, 64, 2)
    $size = 60
    $caption = $quotes[$QuoteStyle][0] + $Name + $quotes[$QuoteStyle][1] + ' edition'
    $format = [System.Drawing.StringFormat]::GenericTypographic
    $resources.Add($format)
    do {
        $title = Font $size ([System.Drawing.FontStyle]::Italic) 'Segoe UI Semibold'
        if ($graphics.MeasureString($caption, $title, 2000, $format).Width -le 890) { break }
        $size--
    } while ($size -gt 12)
    $graphics.DrawString($caption, $title, $accent, [System.Drawing.PointF]::new(70, 205), $format)
    $graphics.DrawString($Version, $small, $muted, 70, 315)
    $scale = [Math]::Min(340 / $head.Width, 340 / $head.Height)
    $rect = [System.Drawing.RectangleF]::new(1230 - $head.Width*$scale/2, 250 - $head.Height*$scale/2, $head.Width*$scale, $head.Height*$scale)
    $graphics.DrawImage($render, $rect)
    [System.IO.Directory]::CreateDirectory((Split-Path $Out -Parent)) | Out-Null
    $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Banner saved: $Out"
    Write-Output "Quotation style: $QuoteStyle"
    Write-Output "Bear raster recolour: $Recolor"
} finally {
    foreach ($resource in $resources) { $resource.Dispose() }
    $head.Dispose()
    $render.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
