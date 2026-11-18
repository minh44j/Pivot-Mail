using System;
using System.Reflection;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace PivotMailSetup
{
    public partial class MainWindow : Window
    {
        static readonly IEasingFunction Ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        bool busy;

        public MainWindow()
        {
            InitializeComponent();
            var v = Assembly.GetExecutingAssembly().GetName().Version;
            Fine.Text = $"Installs for you only · no administrator rights needed · version {v.Major}.{v.Minor}.{v.Build}";
            // The card's corners also clip the waves.
            Root.SizeChanged += (s, e) => Root.Clip = new RectangleGeometry(new Rect(0, 0, Root.ActualWidth, Root.ActualHeight), 17, 17);
            Loaded += (s, e) => { Show(Welcome); InstallBtn.Focus(); };
        }

        /// <summary>Shows one screen with a short fade and rise (the others are hidden).</summary>
        void Show(FrameworkElement screen)
        {
            foreach (var el in new FrameworkElement[] { Welcome, Installing, Ready, Failed }) el.Visibility = el == screen ? Visibility.Visible : Visibility.Collapsed;
            screen.RenderTransform = new TranslateTransform(0, 10);
            screen.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(260)) { EasingFunction = Ease });
            screen.RenderTransform.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(10, 0, TimeSpan.FromMilliseconds(320)) { EasingFunction = Ease });
        }

        void SetProgress(double f, string step)
        {
            Dispatcher.Invoke(() =>
            {
                var w = Math.Max(0, Math.Min(1, f)) * Track.ActualWidth;
                if (w < Fill.ActualWidth) return; // never goes backwards
                Fill.BeginAnimation(WidthProperty, new DoubleAnimation(w, TimeSpan.FromMilliseconds(220)) { EasingFunction = Ease });
                Pct.Text = $"{Math.Round(f * 100)}%";
                Step.Text = step;
            });
        }

        async void OnInstall(object sender, RoutedEventArgs e)
        {
            busy = true;
            CloseBtn.IsEnabled = false; // closing half-way would leave Pivot Mail half installed
            Fill.BeginAnimation(WidthProperty, null);
            Fill.Width = 0;
            Pct.Text = "0%";
            Show(Installing);
            var r = await Installer.InstallAsync(SetProgress);
            busy = false;
            CloseBtn.IsEnabled = true;
            if (r.Ok)
            {
                await System.Threading.Tasks.Task.Delay(350);
                Show(Ready);
                DrawTick();
                FinishBtn.IsDefault = true;
                FinishBtn.Focus();
            }
            else
            {
                FailText.Text = r.Message;
                Show(Failed);
            }
        }

        /// <summary>The green tick draws itself.</summary>
        void DrawTick()
        {
            Tick.StrokeDashArray = new DoubleCollection { 12, 12 };
            Tick.BeginAnimation(System.Windows.Shapes.Shape.StrokeDashOffsetProperty, new DoubleAnimation(12, 0, TimeSpan.FromMilliseconds(450)) { EasingFunction = Ease, BeginTime = TimeSpan.FromMilliseconds(200) });
        }

        void OnFinish(object sender, RoutedEventArgs e)
        {
            try
            {
                Installer.Apply(RunNow.IsChecked == true, Startup.IsChecked == true, Desktop.IsChecked == true);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Pivot Mail is installed, but one of the options could not be applied: " + ex.Message, "Pivot Mail Setup");
            }
            Close();
        }

        void OnRetry(object sender, RoutedEventArgs e) => OnInstall(sender, e);

        void OnClose(object sender, RoutedEventArgs e)
        {
            if (!busy) Close();
        }

        void OnMinimize(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

        void OnDrag(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed) DragMove();
        }
    }
}
