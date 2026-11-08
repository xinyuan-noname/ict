const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

// 单一源：入口挂载同一个 App.tsx，通过别名把 react-native 指向 react-native-web。
module.exports = (_env, argv) => {
  const isDev = argv.mode !== 'production';
  return {
    mode: isDev ? 'development' : 'production',
    entry: path.resolve(__dirname, 'index.web.js'),
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isDev ? 'bundle.js' : 'bundle.[contenthash:8].js',
      // 生产产物要能从 file:// / 子目录打开，使用相对路径；
      // 开发服务器必须挂在根路径，否则 / 会 404。
      publicPath: isDev ? '/' : './',
      clean: true
    },
    resolve: {
      // async-storage 同时提供 ESM 与 CJS；优先 main(browser) 避免严格 ESM 解析
      mainFields: ['browser', 'main', 'module'],
      // .web.* 优先，保证原生实现不被 Web 打包
      extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
      alias: {
        'react-native$': 'react-native-web'
      },
      modules: [path.resolve(__dirname, 'node_modules'), 'node_modules']
    },
    module: {
      rules: [
        {
          test: /\.m?js$/,
          resolve: { fullySpecified: false }
        },
        {
          test: /\.[jt]sx?$/,
          include: [
            path.resolve(__dirname, 'src'),
            path.resolve(__dirname, 'App.tsx'),
            path.resolve(__dirname, 'index.web.js'),
            path.resolve(__dirname, '..', 'contracts', 'generated')
          ],
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['module:@react-native/babel-preset'],
              cacheDirectory: true
            }
          }
        },
        {
          test: /\.jsx?$/,
          include: [path.resolve(__dirname, 'index.web.js')],
          use: {
            loader: 'babel-loader',
            options: { presets: ['module:@react-native/babel-preset'], cacheDirectory: true }
          }
        },
        { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        { test: /\.(png|jpe?g|gif|svg|webp)$/, type: 'asset/resource' }
      ]
    },
    plugins: [
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(isDev),
        'process.env.RN_PLATFORM': JSON.stringify('web'),
        'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production')
      }),
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'web', 'index.html'),
        filename: 'index.html'
      })
    ],
    devServer: {
      port: 3000,
      hot: true,
      // HtmlWebpackPlugin 的 index.html 在内存文件系统里，必须由 dev middleware 提供。
      static: false,
      devMiddleware: { publicPath: '/', index: 'index.html' },
      historyApiFallback: { index: '/index.html' },
      allowedHosts: 'all',
      client: { overlay: { warnings: false, errors: true } },
      // 开发态同源：浏览器请求 3000 端口的 /v1 转发到 authd，
      // 使微信绑定 Cookie（SameSite=Lax）与后续接口请求同源。
      proxy: [
        {
          context: ['/v1'],
          target: 'http://127.0.0.1:8443',
          changeOrigin: false,
          secure: false
        }
      ]
    },
    devtool: isDev ? 'eval-cheap-module-source-map' : false,
    performance: { hints: false }
  };
};