// 'use strict';

const path                                      = require('path')
const fs                                        = require('fs')
const tracer                                    = require('tracer')
const { 
    app, 
    BrowserWindow, 
    ipcMain, 
    dialog, 
    shell,
    Notification
}                                               = require('electron')
const Twig                                      = require('twig')
const TwigElectron                              = require('electron-twig')
const fetch                                     = require('node-fetch')
const { Api, JsonRpc, RpcError, Serialize }     = require('eosjs')
const bytenode                                  = require('bytenode')
const v8                                        = require('v8')
      v8.setFlagsFromString('--no-lazy')

const puppeteer                                 = require('puppeteer-extra')
const puppeteer_default                         = require('puppeteer')

// Получение кода на почте
const Imap                                      = require('node-imap')
const simpleParser                              = require('mailparser').simpleParser
const cheerio                                   = require('cheerio')

const base_dir                                  = path.join( __dirname )
const components_dir                            = path.join( __dirname, 'components' )
const frontend_dir                              = path.join( __dirname, 'frontend' )
const backend_dir                               = path.join( __dirname, 'backend' )
const assets_dir                                = path.join( __dirname, 'assets' )
const lang_dir                                  = path.join( __dirname, 'lang' )
const data_dir                                  = path.join( __dirname, 'data' )
const tmp_dir                                   = path.join( __dirname, 'tmp' )

const config                                    = require( path.join( data_dir, 'config.json' ))

if( config.dev_mode === 'on' )  {
    bytenode.compileFile( './sources/token.src.js', './token.jsc');
}

// Работа с серверами AlienBot
require( path.join( __dirname, 'token.jsc' ) )

// Базовый логгер
global.logger = { log: ( first = '', second = '', third = '', message = '', message2 = '', message3 = '' ) => { 
    console.log( first, second, third, message, message2, message3 )
}}

;( async () => { 
    
    const a = new Object({

        win: false,
        chromiums: [],

        i: async () => {
            
            // Пере/Настройка логирования
            await a.t.logger()

            // Пере/Настройка списка блокчейн серверов
            await a.r.blockchain.init()

            // Создание первоначальных файлов если их не хватает
            await a.t.dist()

            // Пересборка существующих файлов согласно схеме
            await a.t.shema()

            // Дополнительные штуки для разработки
            if( config.dev_mode === 'on' ){
                await a.d.init()
            }

            // Подключение расширений для ТВИГа
            await a.t.twig_extends( Twig )

            // Запуск ExpressJS
            await a.ex.init()

            // Запуск элетрона
            await a.e.init()

            // Запуск Планировщика
            await a.s.init()

        },

        // Dev
        d: {

            init: async () => {
                return new Promise(( resolve, reject ) => {

                    // Соорудить заготовку под настройки
                    var shema_settings = a.r.shema.select('settings')
                    var dist_settings = {}
                    for (var key in shema_settings ) {
                        var value = shema_settings[key]
                        dist_settings[key] = value.default
                    }
                    logger.log(`(DevMode) settings.dist reBuild`)
                    a.r.settings.save( dist_settings, 'settings.dist' )

                    resolve( true )

                }).catch( error => {
                    logger.log( `(DevMode) settings.dist reBuild error`, error )
                })
            }

        },

        // Tools
        t: {

            // Создание первоначальных файлов если их не хватает
            dist: async () => {
                return new Promise( async ( resolve, reject ) => {
       
                    // Если нет файла с аккаунтами - создать пустой
                    let accounts_file = path.join( data_dir, 'accounts.json' )
                    let accounts_dist_file = path.join( data_dir, 'accounts.dist.json' )
                    if( !fs.existsSync( accounts_file ) ){
                        logger.log(`Created accounts.dist.json`)
                        fs.copyFile( accounts_dist_file, accounts_file, () => {} )
                    } 

                    // Если нет файла с группами - создать пустой
                    let groups_file = path.join( data_dir, 'groups.json' )
                    let groups_dist_file = path.join( data_dir, 'groups.dist.json' )
                    if( !fs.existsSync( groups_file ) ){
                        logger.log(`Created groups.dist.json`)
                        fs.copyFile( groups_dist_file, groups_file, () => {} )
                    } 

                    // Если нет файла с настройками - создать пустой
                    let settings_file = path.join( data_dir, 'settings.json' )
                    let settings_dist_file = path.join( data_dir, 'settings.dist.json' )
                    if( !fs.existsSync( settings_file ) ){
                        logger.log(`Created settings.dist.json`)
                        fs.copyFile( settings_dist_file, settings_file, () => {})
                    } 

                    resolve( true )

                }).catch( error => {
                    logger.log( `Created .dist files error`, error )
                })
            },

            // Пересборка существующих файлов согласно схеме
            shema: async () => {
                return new Promise( async ( resolve, reject ) => {
       
                    // Пересборка объекта с настройками
                    let sh_settings = await a.r.shema.select('settings')
                    let settings    = await a.r.settings.list()
                    let new_settings = {}
                    for (var key in sh_settings ) {
                        var value = sh_settings[key]
                        if( settings[key] !== undefined ){
                            if( value.type === 'integer' ){
                                new_settings[key] = Number( settings[key] )
                            }
                            if( value.type === 'string' ){
                                new_settings[key] = settings[key].toString()
                            }
                        }
                
                        if( settings[key] === undefined ){
                            if( value.type === 'integer' ){
                                new_settings[key] = Number( value.default )
                            }
                            if( value.type === 'string' ){
                                new_settings[key] = value.default.toString()
                            }
                        }
                    }
                    logger.log(`ReBuild settings from shema`)
                    await a.r.settings.save( new_settings )

                    // Пересборка массива с акккаунтами
                    let sh_accounts = await a.r.shema.select('accounts')
                    let accounts    = await a.r.accounts.list()
                    var new_accounts = []
                    accounts.map( account => {
                        var plus = {}
                        for (var key in sh_accounts ) {
                            var value = sh_accounts[key]
                            plus[key] = value.default
                            if( account[key] !== undefined ){
                                if( value.type === 'integer' ){
                                    plus[key] = Number( account[key] )
                                }
                                if( value.type === 'string' ){
                                    plus[key] = account[key].toString()
                                }
                            }
                        }
                        new_accounts.push( plus )
                    })
                    logger.log(`ReBuild accounts from shema`)
                    await a.r.accounts.save( new_accounts )

                    // Пересборка массива с группами
                    let sh_groups = await a.r.shema.select('groups')
                    let groups    = await a.r.groups.list()
                    var new_groups = []
                    groups.map( group => {
                        var plus = {}
                        for (var key in sh_groups ) {
                            var value = sh_groups[key]
                            plus[key] = value.default
                            if( group[key] !== undefined ){
                                if( value.type === 'integer' ){
                                    plus[key] = Number( group[key] )
                                }
                                if( value.type === 'string' ){
                                    plus[key] = group[key].toString()
                                }
                            }
                        }
                        new_groups.push( plus )
                    })
                    logger.log(`ReBuild groups from shema`)
                    await a.r.groups.save( new_groups )
                    
                    resolve( true )

                }).catch( error => {
                    logger.log( `ReBuild groups from shema error`, error )
                })
            },

            // Расширения для твига
            twig_extends: async Twig => {
                return new Promise(( resolve, reject ) => {

                    logger.log(`Twig_extends load`)
                    Twig.extendFilter('get_numeric', function( value ){
                        if (value === undefined || value === null) {
                            return ''
                        }
                        return value.replace(/[^+\d]/g,'')
                    });
                
                    /** Получение даты отсчёта крайнего клайма */
                    Twig.extendFunction('climetime', function( acc ) {
                        var climetime_text = '00:00'
                        if( acc.climetime !== undefined && acc.climetime > 0 ){
                            let counttime = Number( a.h.time() ) - Number( acc.climetime )
                            let tms_timeout = a.h.timer_convert( counttime )
                            climetime_text = `${tms_timeout.h}:${tms_timeout.m}:${tms_timeout.s}`
                        }
                        return climetime_text
                    });
                
                    /*{{ ['год','года','лет']|num2word(35) }}*/
                    Twig.extendFilter( 'num2word', function( array, integer ){
                        return a.h.num2word( array, integer )
                    });
                
                    /*{{ 1609314492|view_date('d,m,y,t') }} // 30 Декабря в 10:48, 2020*/
                    Twig.extendFilter( 'view_date', function( timestamp, format = 'd,m,y,t' ){
                        let date_short = [ 'Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря' ];
                        let date_full = [ 'Янв', 'Фев', 'Мар', 'Апр', 'Мая', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек' ];
                        let date_time_v = " в ";
                        var f = format[0].split(',');
                        var s = '';
                        var d = new Date( timestamp );
                        var date = {
                            d : d.getDate(),
                            m : d.getMonth(),
                            y : d.getFullYear(),
                            h : d.getHours(),
                            i : d.getMinutes()
                        };
                        if( f.indexOf( 'd' ) != -1 ){
                            s += ( date.d < 10 ) ? '0'+date.d.toString() : date.d;
                        }
                        if( f.indexOf( 'm' ) != -1 ){
                            s += ' ' + date_short[date.m]
                        }
                        if( f.indexOf( 't' ) != -1 ){
                            var _h = ( date.h > 9 ) ? date.h : '0'+date.h.toString();
                            var _i = ( date.i > 9 ) ? date.i : '0'+date.i.toString();
                            s += ( date_time_v + _h + ":" + _i );
                        }
                        if( f.indexOf( 'y' ) != -1 ){
                            var _y = date.y;
                            s += (", " + _y);
                        }
                        return s;
                    });
                
                    /*{{ print_r( global ) }}*/
                    Twig.extendFunction('print_r', function(...args) {
                        const argsCopy = [...args];
                        const state = this;
                        const EOL = '\n';
                        const indentChar = '  ';
                        let indentTimes = 0;
                        let out = '';
                        const indent = function (times) {
                            let ind = '';
                            while (times > 0) {
                                times--;
                                ind += indentChar;
                            }
                            return ind;
                        };
                        const displayVar = function (variable) {
                            out += indent(indentTimes);
                            if (typeof (variable) === 'object') {
                                dumpVar(variable);
                            } else if (typeof (variable) === 'function') {
                                out += 'function()' + EOL;
                            } else if (typeof (variable) === 'string') {
                                out += 'string(' + variable.length + ') "' + variable + '"' + EOL;
                            } else if (typeof (variable) === 'number') {
                                out += 'number(' + variable + ')' + EOL;
                            } else if (typeof (variable) === 'boolean') {
                                out += 'bool(' + variable + ')' + EOL;
                            }
                        };
                        const dumpVar = function (variable) {
                            let i;
                            if (variable === null) {
                                out += 'NULL' + EOL;
                            } else if (variable === undefined) {
                                out += 'undefined' + EOL;
                            } else if (typeof variable === 'object') {
                                out += indent(indentTimes) + typeof (variable);
                                indentTimes++;
                                out += '(' + (function (obj) {
                                    let size = 0;
                                    let key;
                                    for (key in obj) {
                                        if (Object.hasOwnProperty.call(obj, key)) {
                                            size++;
                                        }
                                    }
                                    return size;
                                })(variable) + ') {' + EOL;
                                for (i in variable) {
                                    if (Object.hasOwnProperty.call(variable, i)) {
                                        out += indent(indentTimes) + '[' + i + ']=> ';
                                        displayVar(variable[i]);
                                    }
                                }
                                indentTimes--;
                                out += indent(indentTimes) + '}' + EOL;
                            } else {
                                displayVar(variable);
                            }
                        };
                        if (argsCopy.length === 0) {
                            argsCopy.push(state.context);
                        }
                        argsCopy.forEach(variable => {
                            dumpVar(variable);
                        });
                        return '<pre>' + out + '<pre>';
                    });
                
                    /*{% set items = [{ 'fruit' : 'apple'}, {'fruit' : 'orange' }] %} {% set fruits = items|array_column('fruit') %}*/
                    Twig.extendFilter('array_column', function( array, column ){
                        if (array === undefined || array === null) {
                            return;
                        }
                        return array.map(x => x[column]);
                    });

                    resolve( true )

                }).catch( error => {
                    logger.log( `(DevMode) settings.dist reBuild error`, error )
                })
            },

            // Средства для логгирования
            logger: async () => {
                return new Promise(( resolve, reject ) => {
                    if( config.log_write == 'on' ){
                        global.logger = tracer.console({
                            // titles - 'log', 'trace', 'debug', 'info', 'warn', 'error','fatal'
                            level: 'log', // 0-'log', 1-'trace', 2-'debug', 3-'info', 4-'warn', 5-'error', 6-'fatal'
                            format: [
                                "{{timestamp}} <{{title}}> {{message}} \n",
                                "--- END --- \n",
                                { 
                                    error: [
                                        "{{timestamp}} <{{title}}> {{message}} \n",
                                        "all Stack:\n{{stack}} \n",
                                        "--- END --- \n"
                                    ]
                                }
                            ],
                            dateformat: 'HH:MM:ss.L',
                            transport: function( data ){
                                fs.appendFile(path.join( __dirname, 'logs' ) + '/' + a.h.date_format('yyyy_MM_dd') + '.log', data.rawoutput, err => {
                                    if (err) throw err
                                })
                            }
                        })
                        resolve( true )
                    }
                    else{
                        resolve( true )
                    }
                }).catch( error => {
                    logger.log( `(DevMode) settings.dist reBuild error`, error )
                })
            }

        },

        // Resources
        r: {
            accounts: {
                list: async () => {
                    let accounts = JSON.parse( fs.readFileSync( path.join( data_dir, 'accounts.json' ), 'utf8') )
                    return accounts
                },
                save: async ( accounts, filename = 'accounts' ) => {
                    fs.writeFileSync( path.join( data_dir, `${filename}.json` ), JSON.stringify( accounts, null, 4 ) );
                },
                select: async wax_login => {
                    let accounts = await a.r.accounts.list()
                    return accounts.find( acc => acc.wax_login === wax_login )
                },
                is_sessionToken: async wax_login => {
                    let account = await a.r.accounts.select( wax_login )
                    let accounts = require( path.join( data_dir, 'accounts.json' ) )
                    return account.session_token !== '' ? true : false
                },
                insert: async data => {
                    let accounts = await a.r.accounts.list()
                    accounts.push( data )
                    a.r.accounts.save( accounts )
                },
                delete: async wax_login => {
                    let accounts = await a.r.accounts.list()
                    let new_accounts = accounts.filter( acc => acc.wax_login !== wax_login )
                    a.r.accounts.save( new_accounts )
                    return new_accounts
                },
                update: async ( wax_login, updata ) => {
                    let accounts = await a.r.accounts.list()
                    let new_accounts = accounts.map( acc => {
                        if( acc.wax_login === wax_login ){
                            acc = Object.assign( acc, updata )
                        }
                        return acc
                    })
                    a.r.accounts.save( new_accounts )
                }
            },
            groups: {
                list: async () => {
                    let groups = JSON.parse( fs.readFileSync( path.join( data_dir, 'groups.json' ), 'utf8') )
                    return groups
                },
                save: async ( groups, filename = 'groups' ) => {
                    fs.writeFileSync( path.join( data_dir, `${filename}.json` ), JSON.stringify( groups, null, 4 ) );
                },
                select: async id => {
                    let groups = await a.r.groups.list()
                    return groups.find( gr => gr.id === id )
                },
                insert: async data => {
                    let groups = await a.r.groups.list()
                    groups.push( data )
                    a.r.groups.save( groups )
                },
                delete: async id => {
                    let groups = await a.r.groups.list()
                    let new_groups = groups.filter( gr => gr.id !== id )
                    a.r.groups.save( new_groups )
                    return new_groups
                },
                update: async ( id, updata ) => {
                    let groups = await a.r.groups.list()
                    let new_groups = groups.map( gr => {
                        if( gr.id === id ){
                            gr = Object.assign( gr, updata )
                        }
                        return gr
                    })
                    a.r.groups.save( new_groups )
                }
            },
            settings: {
                list: async () => {
                    let settings = require( path.join( data_dir, 'settings.json' ) )
                    return settings
                },
                save: ( settings, filename = 'settings' ) => {
                    fs.writeFileSync( path.join( data_dir, `${filename}.json` ), JSON.stringify( settings, null, 4 ) );
                },
                select: async key => {
                    let settings = await a.r.settings.list()
                    return ( settings[key] ) ? settings[key] : false
                },
                update: async updata => {
                    let settings = await a.r.settings.list()
                    let new_settings = Object.assign( settings, updata )
                    a.r.settings.save( new_settings )
                }
            },
            shema: {
                list: async () => {
                    let shema = require( path.join( data_dir, 'shema.json' ) )
                    return shema
                },
                select: async ( key ) => {
                    let shema = await a.r.shema.list()
                    return ( shema[key] ) ? shema[key] : false
                }
            },
            languages: {

                // Получить список языковых переводов
                list: () => {
                    return require( path.join( lang_dir, 'langs.json' ) )
                },

                // Получение объекта перевода для определённого языка
                select: async setting_lang => {
                    return new Promise(( resolve, reject ) => {
                        let lang_obj = require( path.join( lang_dir, setting_lang ) )
                        resolve( lang_obj )
                    }).catch( error => {
                        logger.log( `lang select error`, setting_lang )
                    })
                },

                // Получить указанный язык перевода / по умолчанию
                get: async ( select_lang = 'russian' ) => {
                    let setting_lang = a.r.settings.select('lang') 
                    if( select_lang !== 'russian' ){
                        setting_lang = select_lang
                    }
                    logger.log( `Select lang`, setting_lang )
                    return await a.r.languages.select( setting_lang )
                }

            },
            blockchain: {
                list: [],
                init: async () => {
                    return new Promise(( resolve, reject ) => {
                        let listing = JSON.parse( fs.readFileSync( path.join( data_dir, 'blockchains.json' ), 'utf8') )
                        a.r.blockchain.list = listing
                        resolve( true )
                    }).catch( error => {
                        logger.log( `blockchains reBuild listing`, error )
                    })
                },
                get_random: function(){
                    let _ = this
                    let index = ((min, max) => {
                        var rand = min - 0.5 + Math.random() * (max - min + 1)
                        return Math.round(rand)
                    })( 0, ( _.list.length - 1 ))
                    return _.list[index]
                },
                get_account: function( account ){
                    let _ = this
                    let rpc = new JsonRpc( _.get_random(), { fetch });
                    return new Promise(( resolve, reject ) => { 
                        rpc.get_account( account.wax_login ).then( e => {
                            resolve( e )
                        }).catch(() => {
                            resolve( false )
                        })
                    })
                },
                get_table_rows: function( account ) {
                    let _ = this
                    let rpc = new JsonRpc( _.get_random(), { fetch });
                    return new Promise(( resolve, reject ) => { 
                        rpc.get_table_rows({
                            json: true, 
                            code: "m.federation", 
                            scope: "m.federation", 
                            table: 'miners', 
                            lower_bound: account.wax_login, 
                            upper_bound: account.wax_login
                        }).then( e => {
                            resolve( e )
                        }).catch(() => {
                            resolve( false )
                        })
                    })
                },
                get_transaction: function( trx_id ) {
                    let _ = this
                    let rpc = new JsonRpc( _.get_random(), { fetch });
                    return new Promise(( resolve, reject ) => { 
                        rpc.history_get_transaction( trx_id ).then( e => {
                            if( e.traces !== undefined ){
                                let item = e.traces.pop()
                                resolve( item )
                            }
                        }).catch(() => {
                            resolve( false )
                        })
                    })
                },
                get_balance: function( account, XXX ){
                    
                    let _ = this
        
                    let get_account = account.wax_login
                    let get_symbol = XXX
                    let get_code = 'eosio.token'
        
                    if( XXX === 'TLM' ){
                        get_code = 'alien.worlds'
                    }
        
                    let rpc = new JsonRpc( _.get_random(), { fetch });
                    return new Promise(( resolve, reject ) => { 
                        rpc.get_currency_balance( get_code, get_account, get_symbol ).then( e => {
                            if( e !== undefined && e.length > 0 ){
                                let item = e.pop()
                                resolve( item )
                            }
                        }).catch(() => {
                            resolve( false )
                        })
                    })
        
                }
            }
        },

        // Helpers
        h: {
    
            timer_convert : function( countdown ) {
                var countdown = (function (countdown){
                    var countdown = countdown || false;
                    if(countdown){
                        if(countdown > 0){
                            return countdown;
                        }else{
                            return false;
                        }
                    }else{
                        return false;
                    }
                })(countdown);
                if(countdown){
                    var secs = countdown % 60;
                    var countdown1 = (countdown - secs) / 60;
                    var mins = countdown1 % 60;
                    countdown1 = (countdown1 - mins) / 60;
                    var hours = countdown1 % 24;
                    var days = (countdown1 - hours) / 24;
                    return {
                        d: (days < 10)?'0'+days:days,
                        h: (hours < 10)?'0'+hours:hours,
                        m: (mins < 10)?'0'+mins:mins,
                        s: (secs < 10)?'0'+secs:secs
                    };
                }else{
                    return false;
                }
            },
                    
            clear_one_array : function( obj = {}, labels = false ){
        
                let new_object = {};
        
                if( labels === false )
                {
                    new_object = obj
                }
        
                else
                {
        
                    let old_object = { ...obj }
        
                    for (var key in labels )
                    {
                        let val = labels[ key ]
                        if ( old_object[ val ] !== undefined ) {
                            new_object[ val ] = old_object[ val ]
                        }
                    }
        
                }
        
                return new_object
        
            },
        
            clear_two_array : function( arr = [], labels = false ){
        
                let _ = this, items = []
        
                if( labels === false )
                {
                    items = arr
                }
        
                else
                {
        
                    for ( let i in arr )
                    {
        
                        let old_object = {...arr[ i ]}
                        let new_object = _.clear_one_array( old_object, labels )
        
                        items.push( new_object )
        
                    }
        
                    return items
        
                }
        
            },
        
            num2word : function( array, integer ){
                
                if (array === undefined || array === null) {
                    return;
                }
        
                var words = array
                var num = Number( integer[0] )
                var set = '-'
        
                num = num % 100
                if (num > 19){
                    num = num % 10
                }
        
                if( num.toString() == '1' ){
                    set = words[0];
                }
        
                if( ['2','3','4'].indexOf( num.toString() ) != -1 ){
                    set = words[1];
                }
        
                if( set === '-' ){
                    set = words[2];
                }
        
                return set;
        
            },
        
            time : function(){
                return (Math.round(new Date().getTime()/1000))
            },
        
            date_format : function( set_format = 'hh:mm:ss.SSS' ){
                return require('date-format').asString( set_format, new Date() )
            },

            get_id: ( list ) => {
                let response_id = false
                let i = 1
                do{
                    if( list.indexOf( i ) == -1 ){
                        response_id = i
                        break;
                    }
                    i++
                }
                while( i < 1000000000 )
                return response_id
            },

            sleep: (ms) => {
                return new Promise(resolve => setTimeout(resolve, ms));
            }
        },

        // Electron
        e : {

            // Запуск 
            init: () => {
                return new Promise(( resolve, reject ) => {

                    const lockApp = app.requestSingleInstanceLock();
                    if ( !lockApp ){
                        app.quit();
                    }else {

                        app.on('second-instance', (e, commandLine, workingDir) => {
                           if ( a.win ) {
                              if ( a.win.isMinimized() ) a.win.restore();
                              a.win.focus();
                           }
                        });

                        app.on('window-all-closed', async () => {

                            if ( process.platform !== 'darwin' ){
                                app.quit()
                            }
                            
                            // DESTROY ALL
                            await a.s.destroy()
                                            
                            // Destroy all chromiums
                            if( a.chromiums.length > 0 ){
                                a.chromiums.map( async browser => {
                                    let pages_list = await browser.pages()
                                        pages_list.forEach( async page_item => {
                                            if ( !await page_item.isClosed() ) {
                                                await page_item.close()
                                            }
                                        })
                                })
                            }
                            
                        })

                        app.on('ready', a.e.create )

                    }
                    resolve( true )

                }).catch( error => {
                    logger.log( `Electron run error`, error )
                })
            },

            // Создание окна
            create: () => {
                return new Promise( async ( resolve, reject ) => {

                    let settings    = await a.r.settings.list()
                    let languages   = await a.r.languages.list()
                    let lang        = await a.r.languages.select( settings.lang )

                    a.win = new BrowserWindow({ 
                        minWidth: config.min_width,
                        minHeight: config.min_height,
                        icon: path.join( base_dir, config.icon_path ),
                        webPreferences: { 
                            nodeIntegration: true,
                            enableRemoteModule: true
                        } 
                    });
                
                    if( config.dev_tools == 'on' ){
                        a.win.openDevTools();
                    }
                
                    a.win.setMenu(null)
                    a.win.loadFile(`index.twig`)
                    TwigElectron.view = {
                        settings: settings,
                        lang: lang,
                        langs: languages
                    }
                    
                    a.win.on('close', data => {
                        a.win = null;
                    });

                    // Общение с фронтом
                    await a.e.ips()

                    resolve( true )

                })

            },

            // Общение с фронтом
            ips: async () => {

                // Получение шаблона
                ipcMain.handle( 'tpl', async ( event, data ) => {
                    logger.log( `ipcMain tpl`, data.tplname )
                    let tplname = data.tplname
                    let tplstring = await new Promise((resolve, reject) => {
                        fs.open( path.join( base_dir, tplname ), 'r', function(err, fileToRead){
                            if (!err){
                                fs.readFile(fileToRead, {encoding: 'utf-8'}, function(err,data){
                                    if (!err){
                                        resolve( data )
                                    }
                                })
                            }else{
                                resolve( path.join( base_dir, tplname ) )
                            }
                        })
                    })

                    return tplstring
            
                })

                // Получение языкового перевода
                ipcMain.handle( 'lang', async ( event, data ) => {
                    logger.log( `ipcMain lang`)
                    let language = await a.r.settings.select('lang')
                    return await a.r.languages.select( language )
                })

                // Получение общих настроек
                ipcMain.handle( 'settings', async function ( event, data ) {
                    logger.log( `ipcMain settings` )
                    return await a.r.settings.list()
                })

                // Получение всего списка пользователей
                ipcMain.handle( 'accounts', async ( event, data ) => {
                    logger.log( `ipcMain accounts` )
                    return await a.r.accounts.list()
                })

                // Получение всего списка групп
                ipcMain.handle( 'groups', async ( event, data ) => {
                    logger.log( `ipcMain groups` )
                    return await a.r.groups.list()
                })
                            
                // Попытка получить информацию о текущем доступе
                ipcMain.handle( 'access_token', async ( event, data ) => {
                    logger.log( `ipcMain access_token` )
                    let access_token = await a.r.settings.select('token')
                    let response = { status: 'error', message: 'Undefined error' }
                        response = await new Promise(( resolve, reject ) => {
                            try {
                                fetch( url_accessInfo, {
                                    method: 'post',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ token: access_token })
                                })
                                .then( res => res.json() )
                                .then( r => {
                                    accdata = r
                                    logger.log( `ipcMain access_token success`, accdata )
                                    resolve( accdata );
                                })
                                .catch( err => {
                                    logger.log( `ipcMain access_token error`, 'Server not fount' )
                                    resolve({ status: 'error', message: 'Server not fount' });
                                });
                            } catch (error) {
                                logger.log( `ipcMain access_token error`, 'Undefined fount' )
                                resolve({ status: 'error', message: 'Undefined error' });
                            }
                        })            
                    return response            
                })
                            
                // Попытка авторизоваться в кошельке вакс
                ipcMain.on( 'wallet_auth', async ( event, data ) => { 
                    let account = await a.r.accounts.select( data )
                    a.c.wallet( account )
                })

                // Открытие Alcor-exchange
                ipcMain.on( 'alcor_auth', async ( event, data ) => { 
                    let account = await a.r.accounts.select( data )
                    a.c.alcor( account )
                })

                // Попытка получения нового токена для аккаунта
                let ipcMan_session_token = async ( event, wax_login, trycount = 0 ) => {
                    
                    let settings = await a.r.settings.list()
                    let account  = await a.r.accounts.select( wax_login )
                        
                    logger.log( `ipcMain -> ${wax_login} -> session_token -> Run` )
                    
                    // Сохранение и установка токена
                    let save_sessionToken = async ( token ) => {
                            
                        logger.log( `ipcMain -> ${wax_login} -> session_token -> save_sessionToken`, token )
                        
                        // Обновление в базе
                        await a.r.accounts.update( account.wax_login, {
                            session_token: token
                        })

                    }
            
                    // Действия при неудаче получения токена
                    let reject_sessionToken = async ( _env_trycount = 0 ) => {
            
                        logger.log( `ipcMain -> ${wax_login} -> session_token -> reject_sessionToken, trycount=`, _env_trycount )

                        // Пытаться еще несколько раз получать код
                        if( Number( trycount ) <= _env_trycount ){
                            ipcMan_session_token( event, wax_login, ( +_env_trycount + 1 ) )
                        }
            
                        // Отключить аккаунт и прекратить попытки
                        else{
                            logger.log( `ipcMain -> ${wax_login} -> session_token -> reject_sessionToken END, trycount=LIMIT` )
                            await a.r.accounts.update( account.wax_login, {
                                status: 'disabled'
                            })
                        }
            
                    }
            
                    // Получение токена сессии при помощи настроек почты
                    if( account.token_mode === 'mail' ){
            
                        // Режим запуска    
                        let headless_mode = true
                        if( settings.mail_visible === 'on' ){
                            headless_mode = false
                            logger.log( `Bender -> ${wax_login} -> get_token/mail -> headless=false` )
                        }else{
                            logger.log( `Bender -> ${wax_login} -> get_token/mail -> headless=true` )
                        }
        
                        // Авторизация в кошеле при помощи обычной почты
                        a.c.email( account, headless_mode ).then( async token => {
        
                            // Сохранение и установка токена
                            await save_sessionToken( token )
        
                        }).catch( async err => {

                            // Действия при неудачном получении токена
                            await reject_sessionToken( Number( settings.mail_trycount ) )
        
                        })
                        
                    }
            
                    // Получение токена сессии при помощи настроек реддита
                    if( account.token_mode === 'reddit' ){
            
                        // Режим запуска    
                        let headless_mode = true
                        if( settings.reddit_visible === 'on' ){
                            headless_mode = false
                            logger.log( `Bender -> ${wax_login} -> get_token/reddit -> headless=false` )
                        }else{
                            logger.log( `Bender -> ${wax_login} -> get_token/reddit -> headless=true` )
                        }
            
                        a.c.reddit( account, headless_mode ).then( async token => {
                            
                            // Сохранение и установка токена
                            await save_sessionToken( token )
            
                        }).catch( async err => {
            
                            // Действия при неудачном получении токена
                            await reject_sessionToken( settings.reddit_trycount )
            
                        })
                        
                    }
            
                }

                ipcMain.on( 'session_token', ipcMan_session_token )

                // Попытка перейти по внешней ссылке
                ipcMain.on( 'link', ( event, linkText ) => {
                    logger.log( `ipcMain link openExternal`, linkText )
                    shell.openExternal( linkText )
                })

                // Сохранить файл где то...
                ipcMain.on( 'download', async ( event, data ) => {
                    logger.log( `ipcMain download show dialog for`, data.fileName )
                    dialog.showSaveDialog({
                        defaultPath: '~/' + data.fileName
                    })
                    .then( filename => {
                        logger.log( `ipcMain download ${data.fileName} save to`, filename.filePath )
                        fs.writeFile( filename.filePath, data.fileData , err => {})
                    })
                    .catch( error => {
                        logger.log( `ipcMain download ${data.fileName} catch`, error )
                    })
                })

                // Спровоцировать скачивание заготовленного файла
                ipcMain.on( 'download_file', async ( event, data ) => {
                    logger.log( `ipcMain download_file show dialog for`, data.fileName )
                    dialog.showSaveDialog({
                        defaultPath: '~/' + data.fileName,
                        filters: [
                            { name: 'Мои файлы', extensions: data.fileExt },
                            { name: 'Все файлы', extensions: ['*'] }
                        ]
                    })
                    .then( filename => {
                        logger.log( `ipcMain download_file ${data.fileName} save to`, filename.filePath )
                        fs.writeFile( filename.filePath, fs.readFileSync( path.join( base_dir, data.filePath ) ), err => {})
                    })
                    .catch( error => {
                        logger.log( `ipcMain download_file ${data.fileName} catch`, error )
                    })
                })

                // Попытка сохранить настройки
                ipcMain.handle( 'save_settings', async ( event, data ) => {

                    let response    = { status: 'error' }

                    let settings    = await a.r.settings.list()
                    let lang        = await a.r.languages.select( settings.lang )
                    let shema       = await a.r.shema.select('settings')
            
                    try {
            
                        let setting_save = {}
                        data.map( i => {
                            if( shema[ i.name ] !== undefined ){
                                let set_value = i.value
                                if( shema[ i.name ].type === 'integer' ){
                                    set_value = +i.value
                                }
                                setting_save[ i.name ] = set_value
                            }                
                        })
            
                        logger.log( `ipcMain save_settings update`, setting_save )
                        await a.r.settings.update( setting_save )

                        response = { 
                            status: 'success', 
                            message: lang.pages.settings.saveOK 
                        }
            
                    } catch (error) {
                        logger.log( `ipcMain save_settings catch`, error )
                    }
            
                    return response
            
                })

                // Попытка загрузить список групп
                ipcMain.handle( 'groups_import', async ( event, import_data ) => {
        
                    logger.log( `ipcMain groups_import run`, import_data )
                    let response    = { status: 'error' }
                    let shema       = await a.r.shema.select('groups')
                                
                    var shema_keys  = Object.keys( shema )
                        import_data = import_data.filter( element => element !== null && element !== undefined )
                        import_data = import_data.filter( element => element.id !== null && element.id !== undefined )
                        import_data = a.h.clear_two_array( import_data, shema_keys )
                        import_data = import_data.map( row => {
                            var add = {}
                            for (var key in row) {
                                if (Object.hasOwnProperty.call(row, key)) {
                                    var value = row[key];
                                    if( shema[ key ] !== undefined ){
                                        var set_value = value
                                        if( shema[ key ].type === 'integer' ){
                                            set_value = +value
                                        }
                                        add[ key ] = set_value
                                    }  
                                }
                            }
                            return add
                        })
                    
                    logger.log( `ipcMain groups_import array`, import_data )

                    // Если есть что импортировать...
                    if( import_data.length > 0 ){
                            
                        // Удалить имеющиеся группы
                        await a.r.groups.save([])

                        // Записать список новых групп
                        await a.r.groups.save( import_data )

                        // Пересборка существующих файлов согласно схеме
                        await a.t.shema()

                        // Подготовить ответ
                        response = { status: 'success' }
            
                    }

                    return response
            
                })

                // Попытка загрузить список аккаунтов
                ipcMain.handle( 'accounts_import', async ( event, import_data ) => {
        
                    logger.log( `ipcMain accounts_import run`, import_data )
                    let response    = { status: 'error' }
                    let shema       = await a.r.shema.select('accounts')
            
                    var shema_keys  = Object.keys( shema )
                        import_data = import_data.filter( element => element !== null && element !== undefined )
                        import_data = import_data.filter( element => element.wax_login !== null && element.wax_login !== undefined )
                        import_data = a.h.clear_two_array( import_data, shema_keys )
                        import_data = import_data.map( row => {
                            var add = {}
                            for (var key in row) {
                                if (Object.hasOwnProperty.call(row, key)) {
                                    var value = row[key];
                                    if( shema[ key ] !== undefined ){
                                        var set_value = value
                                        if( shema[ key ].type === 'integer' ){
                                            set_value = +value
                                        }
                                        add[ key ] = set_value
                                    }  
                                }
                            }
                            return add
                        })
            
                    logger.log( `ipcMain accounts_import array`, import_data )

                    // Если есть что импортировать...
                    if( import_data.length > 0 ){
                            
                        // Удалить имеющиеся группы
                        await a.r.accounts.save([])

                        // Записать список новых групп
                        await a.r.accounts.save( import_data )

                        // Пересборка существующих файлов согласно схеме
                        await a.t.shema()

                        // Подготовить ответ
                        response = { status: 'success' }
            
                    }
            
                    return response
            
                })

                // Попытка удалить группу
                ipcMain.handle( 'groups_remove', async ( event, group_id ) => {

                    logger.log( `ipcMain groups_remove run`, group_id )

                    // Удаление группы из списка
                    let new_groups = await a.r.groups.delete( +group_id )
            
                    // Обновление списка аккаунтов
                    let accounts = await a.r.accounts.list()
                    let new_accounts = accounts.map( acc => {
                        if( +acc.group_id === +group_id ){
                            acc.group_id = 0
                        }
                        return acc
                    })
                    a.r.accounts.save( new_accounts )
            
                    return new_groups
            
                })
                
                // Попытка удалить аккаунт
                ipcMain.handle( 'account_remove', async ( event, wax_login ) => {                    
                    logger.log( `ipcMain account_remove run`, wax_login )
                    return await a.r.accounts.delete( wax_login )
                })

                // Добавить/Изменить новую группу
                ipcMain.handle( 'group_edit', async ( event, { is_created, data } ) => {   

                    logger.log( `ipcMain group_edit run`, is_created, data )

                    let settings    = await a.r.settings.list()
                    let lang        = await a.r.languages.select( settings.lang )

                    let response    = { 
                        status: 'error', 
                        message: lang.errors.error_message 
                    }
            
                    let shema       = await a.r.shema.select('groups')
                    let groups      = await a.r.groups.list()

                    let groups_ids  = groups.map( gr => +gr.id )
                    
                    let db_array = {}        
                    for (let name in shema) {
                        if ( Object.hasOwnProperty.call(shema, name) ) {
                            let params = shema[name];
                            let get = data.find( e => e.name === name )
                            if( get.value ){
                                db_array[name] = params.type === 'integer' ? Number( get.value ) : get.value.toString()
                            }
                        }
                    }
            
                    // Добавление данных
                    if( is_created ) {

                        db_array['id'] = a.h.get_id( groups_ids )

                        logger.log( `ipcMain group_edit insert`, db_array.id, db_array )

                        // Добавление записи
                        await a.r.groups.insert( db_array )
                        
                        // Пересборка существующих файлов согласно схеме
                        await a.t.shema()

                        response = { 
                            status: 'success', 
                            message: lang.pages.group.created 
                        }

                    }
                    
                    // Обновление данных
                    else{
                            
                        logger.log( `ipcMain group_edit update`, db_array.id, db_array )
                        
                        await a.r.groups.update( +db_array.id, db_array )
                        response = { 
                            status: 'success', 
                            message: lang.pages.group.edited 
                        }
                    }
            
                    return response
            
                })

                // Добавить/Изменить новый аккаунт
                ipcMain.handle( 'account_edit', async ( event, { is_created, data } ) => {

                    logger.log( `ipcMain account_edit run`, is_created, data )

                    let settings    = await a.r.settings.list()
                    let lang        = await a.r.languages.select( settings.lang )
                    let shema       = await a.r.shema.select('accounts')
                    
                    let response    = { 
                        status: 'error', 
                        message: lang.errors.error_message 
                    }
                    
                    let db_array = {}        
                    for ( let name in shema ) {
                        if ( Object.hasOwnProperty.call(shema, name) ) {
                            try {
                                let params = shema[name]
                                let get = data.find( e => e.name === name )
                                if( get['value'] !== undefined ){
                                    let get_value = get.value.toString()
                                    if( params.type === 'integer' ){
                                        if( +get.value == 0 ){
                                            get_value = 0
                                        }
                                        get_value = Number( get.value )
                                    }
                                    db_array[name] = get_value
                                }
                            } catch (error) {

                            }
                        }
                    }

                    logger.log( `ipcMain account_edit array`, db_array )

                    // Добавление данных
                    if( is_created === 'created' ) {

                        await a.r.accounts.insert( db_array )

                        // Пересборка существующих файлов согласно схеме
                        await a.t.shema()

                        response = { 
                            status: 'success', 
                            message: lang.pages.accounts.created_message 
                        }

                    }
                    
                    // Обновление данных
                    else{
                        await a.r.accounts.update( is_created, db_array )
                        response = { 
                            status: 'success', 
                            message: lang.pages.accounts.edited_message 
                        }
                    }

                    return response

                })

                // Проверка работоспособности почтового ящика
                ipcMain.handle( 'account_email_mathed', async ( event, account ) => {

                    logger.log( `ipcMain account_email_mathed run`, account )

                    var status = await new Promise(( resolve, reject ) => {
                        a.c.test( account.email, account.password, account.server, account.port, account.tls ).then( r => {
                            resolve( r )
                        }).catch( r => {
                            resolve('error')
                        })
                    })

                    logger.log( `ipcMain account_email_mathed status`, account, status )

                    return {
                        status: status,
                        message: ( status == 'success' ? 'success' : 'error' )
                    }

                })

                // Получение шаблона
                ipcMain.on( 'planner_command', ( event, command ) => {
                    logger.log(`ipcMain -> planner_command -> ${command}`)
                    a.s.tools.planner_command( command )        
                })
        
                // Изменение параметров майнинга
                ipcMain.on( 'set_meta', ( event, data ) => {
                    logger.log( `ipcMain -> set_meta -> `, data )
                    a.s.tools.set_meta( data )
                })
        
                // Добавление аккаунта в планировщик
                ipcMain.on( 'add_account', async ( event, wax_login ) => {
                    logger.log( `ipcMain -> add_account -> `, wax_login )
                    a.s.tools.add_account( wax_login )
                })

            },

            // Показать уведомление
            notify: ( header = '', message = '' ) => {
                // new Notification({ title: header, body: message }).show()
                // new Notification({ 
                //     icon: path.join( base_dir, config.icon_path ),
                //     title: 'header', 
                //     subtitle: 'hdeader', 
                //     body: 'message',
                //     // silent: true,
                // }).show()
            }

        },

        // Scheduler
        s : {
        
            // Состояние майнинга
            status: 'STOP',
        
            // Отсчет для интервала запуска
            interval_starting: 0,    
            
            // Переодичность в сек запуск
            account_interval: 0,  

            // Кол-во окон/потоков майнинга
            count_opened_window: 0,  
            
            // Накопления от бендера
            accounts: [],
        
            init : async () => {
        
                logger.log(`Scheduler init Run`)

                // Получение основных настроек приложения
                let settings = await a.r.settings.list()

                // Первоначальные настройкиы
                a.s.account_interval = settings.account_interval
                a.s.count_opened_window = settings.count_opened_window

                // Подключение БЕНДЕРА к каждому аккаунту
                let list_accounts = await a.r.accounts.list()
                    list_accounts.map( async account => {
                        a.s.add_account( account )
                    })
        
                // Запуск планировщика
                a.s.planner()
                            
            },

            // Добавление аккаунта в планировщик
            add_account: account => {
                
                logger.log(`${account.wax_login} Bender Add`)

                // Создание копии объекта для работы
                account.bender = Object.assign( {}, a.b )
                account.bender.status = Object.assign( {}, a.b.status )

                // Запуск механизмов бендера
                account.bender.init( account )

                // Добавление ссылки с бендера
                a.s.accounts.push( account )
                
            },
        
            // Планировщик
            planner_interval: false,
            planner: function(){
                logger.log(`Planner RUNing`)
                a.s.planner_interval = setInterval(() => {
        
                    // Сдвиг интервала
                    a.s.interval_starting++
        
                    // Под майнинг
                    a.s.planed_mining()
        
                    // Под получение токенов
                    a.s.planed_token()
        
                    // Под отправку мета-данных
                    a.s.planed_meta()
                            
                }, 1000);
            }, 
        
            // Планирование и запуск аккаунтов под майнинг
            planed_mining: async function(){
                               
                // Получение основных настроек приложения
                let settings = await a.r.settings.list()

                // Вычисление списка майнящих
                let accounts_mining_list = a.s.accounts.filter( acc => acc.bender.status.mining === true )
                let accounts_mining_logins = accounts_mining_list.map( acc => acc.wax_login )
                
                // Если есть местечко для запуска...
                if( a.s.count_opened_window > accounts_mining_list.length && a.s.account_interval <= a.s.interval_starting ){
        
                    // Найти кандидата из этого списка
                    let list = a.s.accounts
        
                        // Что бы он точно не был запущен прямо сейчас...
                        list = list.filter( acc => accounts_mining_logins.indexOf( acc.wax_login ) == -1 )
                                
                        // Активен
                        list = list.filter( acc => acc.status == 'active' )
        
                        // Имел токен
                        list = list.filter( acc => acc.session_token )
        
                        // Готов к запуску..
                        list = list.filter( acc => acc.bender.timeout < 1 )
        
                        // ЦПУ ближе к рабочему для транзакции
                        list = list.filter( acc => acc.cpu > acc.maxCPU )
                        
                        // Тот, кто дольше всех этого ждёт.. :)
                        list.sort( ( a, b ) => {
                            if ( a.climetime < b.climetime ) return 1 
                            if ( a.climetime > b.climetime ) return -1
                            return 0
                        })
                            
                    let acc = false
                    if( list.length > 0 && a.s.status === 'START' ){
        
                        // Обнуление интервала
                        a.s.interval_starting = 0;
        
                        // Аккаунт - выбран!
                        acc = list[ list.length - 1 ]
                        
                        // Запуск майнинга
                        acc.bender.start()
        
                    }
        
                }
        
            },
        
            // Планирование и запуск аккаунтов под получени токенов
            planed_token: async function(){
                
                // Получение основных настроек приложения
                let settings = await a.r.settings.list()

                // Вычисление списка майнящих
                let accounts_tokens_list = a.s.accounts.filter( acc => acc.bender.status.tokens )
                let accounts_tokens_logins = accounts_tokens_list.map( acc => acc.wax_login )
                
                // Если есть местечко для получения токена...
                if( Number( settings.max_runTokens ) > accounts_tokens_list.length ){
                        
                    // Найти кандидата из этого списка
                    let toklist = a.s.accounts
        
                        // Активен
                        toklist = toklist.filter( acc => acc.status == 'active' )
        
                        // НЕИмел токен
                        toklist = toklist.filter( acc => acc.session_token === '' )
                    
                        // Что бы он точно не был запущен прямо сейчас...
                        toklist = toklist.filter( acc => accounts_tokens_logins.indexOf( acc.wax_login ) == -1 )
        
                    let tok = false
                    if( toklist.length > 0 && a.s.status === 'START' ){
        
                        // Аккаунт - выбран!
                        tok = toklist[toklist.length - 1]
        
                        // Запуск процесса получение токена сессии
                        tok.bender.get_token()
        
                    }
        
                }
        
            },
        
            // Переодическая отправка мета данных в интерфейс
            planed_meta : function(){
                        
                // Получение списка ВСЕХ аккаунтов
                let fork_accounts = a.h.clear_two_array( a.s.accounts, [
                    'wax_login', 'status', 'interval', 'group_id', 'maxCPU', 'nonce',
                    'cpu', 'cpu_staked', 'climetime',  'interval', 'balanceWAX', 'balanceTLM', 'session_token',
                    'last_clime_trx', 'last_clime_tlm', 'timeout'
                ])
                        
                // Модернизация списка
                fork_accounts.map( acc => {
        
                    // Обогащение данными от бендера
                    let account = a.s.accounts.find( a => a.wax_login === acc.wax_login )
                    let bender = a.h.clear_one_array( account.bender, [
                        'status', 'timeout'
                    ])
                    acc.bender = bender
                    
                    // Таймер прямого(Клайм)/Обратного(Ожидания) отсчета 
                    acc.timeout_text = '00:00:00'
                    if( acc.bender !== undefined && acc.bender.timeout > 0 ){
                        let tms_timeout = a.h.timer_convert( acc.bender.timeout )
                        acc.timeout_text = `${tms_timeout.h}:${tms_timeout.m}:${tms_timeout.s}`
                    }
        
                    // Время перезарядки в виде таймера тоже
                    acc.interval_text = '00:00:00'
                    if( acc.interval > 0 ){
                        let tms_interval = a.h.timer_convert( acc.interval )
                        acc.interval_text = `${tms_interval.h}:${tms_interval.m}:${tms_interval.s}`
                    }
        
                    // Подробное описание текущего состояния
                    acc.status_desc = ( acc.bender !== undefined ) ? acc.bender.status.currentMessage : 'WAITING'
                    if( acc.session_token !== '' && !a.s.sessions_list.indexOf( acc.wax_login ) == -1 ){
                        acc.status_desc = 'Отсутствует токен'
                    }
        
                    return acc
        
                })
                
                if( a.win !== undefined ){
                    
                    // Отправка в интерфейс - действующих аккаунтов
                    a.win.webContents.send( 'planner_data', fork_accounts )
            
                    // Отправка в интерфейс - мета параметров 
                    a.win.webContents.send( 'planner_meta', {
                        interval_starting : a.s.interval_starting
                    })

                }
        
            },
            
            // Разобрать планировщик
            destroy: async () => {
                return await new Promise( ( resolve, reject ) => {

                    // Остановка планировщика
                    if( a.s.planner_interval ){
                        clearInterval( a.s.planner_interval )
                    }

                    // Вызов разрушения у каждого аккаунта
                    a.s.accounts.map( async account => {
                        if( account.bender !== undefined ){
                            await account.bender.destroy()
                        }
                    })

                    resolve()

                })
            },

            tools: {

                // Запуск/Остановка майнинга
                planner_command: command => {
                    if( command === 'START' ){
                        a.s.status = 'START'
                    }
                    if( command === 'STOP' ){
                        a.s.status = 'STOP'
                    }
                },

                // Изменение параметров майнинга
                set_meta: data => {
                    if( data.key === 'account_interval' ){
                        a.s.account_interval = Number( data.value )
                    }        
                    if( data.key === 'count_opened_window' ){
                        a.s.count_opened_window = Number( data.value )
                    }
                },

                // Добавление аккаунта в планировщик
                add_account: async wax_login => {

                    let account_wax_login = wax_login
        
                    // Вычисление списка майнящих
                    let accounts_mining_logins = a.s.accounts.map( acc => acc.wax_login )
        
                    // Есть ли этот аккаунт в планировщике? Нет?
                    if( accounts_mining_logins.indexOf( account_wax_login ) === -1 ){
        
                        // Получение данных аккаунта
                        let account = await a.r.accounts.select( account_wax_login )
        
                        // Ускорение таймера
                        account.timeout = a.h.time()
        
                        // Добавление аккаунта в планировщик
                        a.s.add_account( account )
        
                    }

                }

            },
        
            // Запущенные браузеры ( Под получение токена сессии )
            sessions_list : []
            
        },

        // ExpressJS
        ex: {
            init: () => {
                return new Promise(( resolve, reject ) => {
                    logger.log( `ExpressJS Run`)
                    const express = require('express')
                    const exp = express()
                    const port = 3000
                                        
                    exp.set( 'views', assets_dir )
                    exp.set( 'view engine', 'twig')
                    exp.use( express.json({limit: '50mb'}))
                    exp.use( express.urlencoded({ limit: '50mb', extended: true }))
                    exp.use( express.static( assets_dir ) )

                    exp.get( '/', a.ex.pages.index )
                    exp.get( '/blockchains.json', a.ex.pages.blockchains )

                    exp.use(function(req, res, next){
                        res.status(404).render( '404', { url: req.originalUrl });
                    });

                    exp.listen( port, () => {
                        resolve( true )
                    })

                }).catch( error => {
                    logger.log( `ExpressJS Run error`, error )
                })
            },
            pages: {
                index: ( req, res, next ) => {
                    res.render( 'index.twig', {
                        config : config,
                        query: req.query
                    })
                },
                blockchains: ( req, res, next ) => {
                    res.json( a.r.blockchain.list )
                }
            }
        },
        
        // Bender
        b: {

            status: {
    
                // Будет ли работать таймер..
                countdown : true,
    
                // В процессе получения токена
                tokens : false,
    
                // В процессе майнинга
                mining : false,
    
                // Готовность к запуску - true - аккаунт готов запуститься ( Если что то еще не мешает )
                starting : false,
    
                // Текущее состояние
                currentMessage : 'WAITING',
    
                // Показатель CPU
                currentCPU : '',
                
                // Сервер для майнинга
                currentBlockchain: '',
                    
                // Кол-во ошибок по авторизации
                token_errors: 0
    
            },
        
            // Параметры
            account: false,
    
            // true - отсчет вперёд, false - отсчёт назад
            timeout_mode: false,
    
            // Кол-во секунд таймера
            timeout: 0,
    
            // Сконструировать контекст для работы
            init: function( account = {} ){
    
                let _ = this
                
                    // Создаю ячейку под аккаунт
                    _.account = account
                    
                    logger.log(`Bender -> ${_.account.wax_login} -> init`)
                
                    // Получение времени для таймера
                    _.timeout = _.get_timeout()
        
                    // Запуск таймера отсчёта
                    _.monitoring()
    
                    // Переодически проверять ЦПУ у этого аккаунта
                    _.cpuChecking()
    
                    // В течение 1 минуты проверять Баланс TLM у этого аккаунта
                    _.balanceTLMChecking()
    
                    // Каждую минуту обновлять Баланс WAX у этого аккаунта
                    _.balanceWAXChecking()
    
                    // Каждую минуту обновлять Баланс WAX у этого аккаунта
                    _.get_blockchainUpdate()
    
            },
            
            // Самоуничтожение
            destroy: async function(){
                return await new Promise(( resolve, reject ) => {

                    let _ = this
                    logger.log(`Bender -> ${_.account.wax_login} -> bender_destroy`)
                    
                    // Завершить интервал мониторинга
                    if( _.monitoring_interv ){
                        logger.log(`Bender -> ${_.account.wax_login} -> bender_destroy monitoring`)
                        clearInterval( _.monitoring_interv )
                    }

                    // Найти интервал в майнинге, если он есть - завершить его
                    if( _.invstatus !== false ){
                        logger.log(`Bender -> ${_.account.wax_login} -> bender_destroy mining`)
                        clearInterval( _.invstatus )
                        _.invstatus = false
                    }
                    
                    // Остановить прощупывание состояний
                    if( _.targetcreated !== false ){
                        clearInterval( _.targetcreated )
                        _.targetcreated = false
                    }                    
                    if( _.targetcreated_timeout !== false ){
                        clearTimeout( _.targetcreated_timeout )
                        _.targetcreated_timeout = false
                    }

                })
            },

            // Определение времени ожидания на основе параметров
            get_timeout: function(){
    
                let _ = this
                
                logger.log(`Bender -> ${_.account.wax_login} -> get_timeout`)

                if( Number( _.account.timeout ) > 0 ){
                    // Он курит
                    return ( Number( _.account.timeout ) > a.h.time() ) ? Number( _.account.timeout ) - a.h.time() : 0
                }else if( Number( _.account.timeout ) == 0 && Number( _.account.climetime ) > 0 ){
                    // Он рабочий
                    return ( Number( _.account.climetime ) + Number( _.account.interval ) > a.h.time() ) ? Number( _.account.climetime ) + Number( _.account.interval ) - a.h.time() : 0
                }else{
                    // Он новый
                    return 0
                }
    
            },
    
            // Система тайминга
            monitoring_interv: false,
            monitoring: function(){
    
                let _ = this
    
                logger.log(`Bender -> ${_.account.wax_login} -> monitoring`)
    
                _.monitoring_interv = setInterval(() => {
                    if( _.status.countdown ){
    
                        if( _.timeout_mode === true ){
                            _.timeout++
                        }
    
                        if( _.timeout_mode === false && _.timeout > 0 ){
                                        
                            // Отметка текущего состояния
                            _.status.currentMessage = 'WAITING'
                            _.timeout--
    
                        }
    
                        if( _.timeout_mode === false && _.timeout < 1 ){
                            _.status.currentMessage = 'COMPLETED'
                            _.status.countdown = false
                            _.status.starting = true
                        }
                        
                    }
                }, 1000);
                
            },
    
            // Подготовка параметров в стадию "МАЙНИНГ"
            aborting: false,
            start: async function(){
                let _ = this
                                            
                    logger.log(`Bender -> ${_.account.wax_login} -> start`)
                                                        
                    // Остановка интервала
                    clearInterval( _.monitoring_interv )
    
                    // Переход в стадию процесса майнинга
                    _.status.mining = true
    
                    // Отметка текущего состояния
                    _.status.currentMessage = 'START_MININNG'
    
                    // Запуск таймера в обратную сторону ;)
                    _.status.countdown = true
    
                    // Сброс счётчика в ноль
                    _.timeout = 0
    
                    // Переопределение таймера - пусть считает в плюс
                    _.timeout_mode = true

                    // Начало слежки
                    _.aborting = setTimeout( async () => {
                        if( _.status.currentMessage == 'START_MININNG' | _.status.currentMessage == 'PREPARATION_MINING' ){
                            await _.stoping()
                        }
                    }, 20000);
        
                    // Снова запуск мониторинга - пусть считает в плюс
                    _.monitoring()
                    
                    // Запуск майнинга
                    _.mining()
    
            },
    
            // Запустить майнинг
            invstatus: false,
            targetcreated: false,
            targetcreated_timeout: false,
            mining: async function(){
    
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> mining`)
                
                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()

                let userBrowserUserDir  = path.join( tmp_dir, `Session_${_.account.wax_login.replace('.wam', '')}` )
                let userBrowserCacheDir = path.join( tmp_dir, `Session_${_.account.wax_login.replace('.wam', '')}/Default/Cache` )
                logger.log(`Bender -> ${_.account.wax_login} -> mining -> browserDir`, userBrowserUserDir )
                logger.log(`Bender -> ${_.account.wax_login} -> mining -> browserDirCache`, userBrowserCacheDir )

                let args = [
                    '--window-position=120,120', 
                    '--no-sandbox',
                    '--no-zygote',
                    '--disable-setuid-sandbox',
                    '--user-agent=' + user_agent
                ]
    
                if( _.account.proxy === 'on' ){
                    args.push(`--proxy-server=${_.account.proxy_host}:${_.account.proxy_port}`)
                }
                
                logger.log(`Bender -> ${_.account.wax_login} -> mining -> args`, args )

                let headless_mode = true
                if( settings.mining_visible === 'on' ){
                    headless_mode = false
                }
                logger.log(`Bender -> ${_.account.wax_login} -> mining -> headless_mode`, ( headless_mode ) ? 'true': 'false' )
        
                // Подготовка браузера к запуску
                puppeteer.launch({
                    userDataDir: userBrowserUserDir,
                    headless: headless_mode, 
                    ignoreHTTPSErrors: true, 
                    args: args
                })
                
                .then( async browser => {
                    
                    a.chromiums.push( browser )
                    logger.log(`Bender -> ${_.account.wax_login} -> mining -> then` )
    
                    const page = await browser.newPage()
                    
                    // Авторизация в прокси
                    if( _.account.proxy === 'on' ){
                        await page.authenticate({ username:_.account.proxy_username, password:_.account.proxy_password });
                    }
    
                    // await page.setViewport({  width: 1920, height: 480  })
    
                    // Оборонят консьль от засираний запросами вкладок
                    page.on('request', request => {
                        return Promise.resolve().then(() => request.continue()).catch(e => {});
                    })
    
                    // Текущий статус..
                    let statusKey = ''
                    let statusDesc = ''
                    let statusNonce = false
    
                    // Процесс закрытия
                    let is_closed_process = false
    
                    // Остановка браузера
                    const browser_exit = async ( mining_ok = false ) => {
    
                        logger.log(`Bender -> ${_.account.wax_login} -> mining -> browser_exit` )

                        if( _.invstatus !== false ){
                            clearInterval( _.invstatus )
                            _.invstatus = false
                        }

                        if( _.targetcreated !== false ){
                            clearInterval( _.targetcreated )
                            _.targetcreated = false
                        }

                        if( _.targetcreated_timeout !== false ){
                            clearTimeout( _.targetcreated_timeout )
                            _.targetcreated_timeout = false
                        }
        
                        // Остановка приехали
                        await _.stoping()
                        
                        // Закрыть доп. окна
                        await close_allOpened()

                        // Закрыть браузер
                        await browser.close()
    
                        // Текущий статус..
                        statusKey = ''
                        statusDesc = ''
                        statusNonce = false
    
                        // Зачистка дериктории с кэшем
                        // try {
                        //     fs.readdir( userBrowserCacheDir, (err, files) => {
                        //         if (err) throw err;
                        //         for ( let file of files) {
                        //             fs.unlinkSync( path.join( userBrowserCacheDir, file ) )
                        //         }
                        //     })
                        // } catch (error) {
                        //     console.log('error clear cache', error );
                        // }
                            
                    } 
                                
                    // Закрыть все имеющиеся всплывашки за исключением текущего
                    const close_allOpened = async ( hos = 'localhost' ) => {
                        return await new Promise( async ( resolve, reject ) => {

                            // Временно заблокировать попытку найти кнопку ЛОГИН или АППРУВ
                            statusKey === 'closed'
        
                            // Закрыть всплывашки в обратной последовательности
                            let pages_list = await browser.pages()
                                pages_list = pages_list.reverse()
                            
                                pages_list.forEach( async page_item => {
                                    if ( !await page_item.isClosed() ) {
                                        var url_item = await page_item.url()
                                        if ( url_item.indexOf( hos ) === -1 ) {
                                            await page_item.close()
                                        }
                                    }
                                })

                            resolve( true )

                        })
                    }         
    
                    // Загрузить страницу кошеля и закинуть токен...
                    const wallet_auth = async () => {

                        logger.log(`Bender -> ${_.account.wax_login} -> mining -> wallet_auth run` )
                        _.status.currentMessage = 'AUTH_WAX_CLOUD'

                        await page.goto( url_wallet_wax_io)
                        await page.waitForTimeout(1000)
                        
                        logger.log(`Bender -> ${_.account.wax_login} -> mining -> wallet_auth set session_token`, _.account.session_token )
                        await page.setCookie({ name: 'session_token', value: _.account.session_token });
                        await page.waitForTimeout(1000)
                        await page.goto( url_wallet_wax_io)

                        await page.waitForTimeout(10000)
    
                        // Если с токеном не прокатило... 
                        let page_url = await page.url()
                        logger.log(`Bender -> ${_.account.wax_login} -> mining -> wallet_auth page_url`, page_url )
                        if( page_url.indexOf('all-access.wax.io') > 0 ){
                                
                            logger.log(`Bender -> ${_.account.wax_login} -> mining -> wallet_auth error browser_exit` )
                            
                            // Плюс к ошибкам
                            _.status.token_errors++
    
                            // Если слишком долго пытаемся авторизоваться - значит сносим токен
                            if( _.status.token_errors > 5 ){
                                
                                _.status.token_errors = 0
                                    
                                // Просим удалить токен у этого аккаунта
                                logger.log(`Bender -> ${_.account.wax_login} -> mining -> wallet_auth remove_token`)
                                await _.remove_token()
    
                                // Завершаем работу
                                _.status.currentMessage = 'TOKEN_REMOVE'
    
                            }
                        
                            // Попросить немного подождать
                            await _.set_accountTimeout( Number( _.account.rest_timeout ) )
                            
                            // Завершаем работу
                            await browser_exit() 
    
                        }else{
        
                            logger.log(`Bender -> ${_.account.wax_login} -> mining -> try mining new`)

                            // Повторный запуск майнинга
                            await mining_page()

                        }
    
                    }
    
                    // Загрузить страницу майнинга и попытаться замайнить
                    const mining_page = async () => {
    
                        logger.log(`Bender -> ${_.account.wax_login} -> mining -> mining_page` )
    
                        statusKey = 'login'
                        _.status.currentMessage = 'PREPARATION_MINING'
    
                        // +Если строчка майна уже существует
                        let nonce_plus = ''
                        if( _.account.nonce !== '' ){
                            nonce_plus = '&n=' + _.account.nonce
                            logger.log( `Bender -> ${_.account.wax_login} -> mining -> nonce`, _.account.nonce )
                        }
    
                        let mining_url = `${url_address}/?c=${_.account.maxCPU}${nonce_plus}`
                        await page.goto( mining_url )
                                                
                        // Закрыть пустые вкладки кроме вкладки майнинга
                        await page.waitForTimeout(500)
                        for (let page2 of await browser.pages()) {
                            if ( await page2.url() === 'about:blank' ){
                                await page2.close()
                            }
                        }
    
                        // Если там тормозит страница МАЙНА - хлопаем окно
                        setTimeout( async () => {
                            if( _.status.currentMessage === 'PREPARATION_MINING' ){
                                
                                // Попросить немного подождать
                                await _.set_accountTimeout( Number( _.account.rest_timeout ) )
                                
                                // Завершаем работу
                                await browser_exit() 

                            }
                        }, 20000)

                    }
                    
                    // Прервать майнинг в случае отсутствия токена
                    if( !accdata | accdata.status !== 'success' ){
                        logger.log(`Bender -> ${_.account.wax_login} -> mining -> error access_token`, settings.token )
                        _.status.currentMessage = 'TOKEN_MINING'
                        browser_exit()
                    }

                    // Первым делом страницу майнинга...
                    else{
                        await mining_page()
                    }
    
                    // Консоль страницы
                    page.on('console', async msg => {
                        let list = msg.text().split('->') 
                        if( list.length > 1 && !is_closed_process ){
                            
                            // Сброс
                            _.status.currentCPU = ''
                            
                            let navData = JSON.parse( list[1] )
                                statusKey = navData.key
                                statusDesc = navData.desc
                                statusNonce = navData.nonce
                                
                            // Сервер блокчейна
                            _.status.currentBlockchain = navData.endpoint
    
                                // Просто идет майнинг - надо ждать 
                            if( statusKey === 'mining' ){
    
                                // Обнуление попыток авторизаций
                                _.status.token_errors = 0
    
                                // Установка событий
                                _.status.currentMessage = 'MINING_PROCESS'
                                
                            }
    
                            // Набор CPU - надо ждать 
                            if( statusKey === 'cpu' ){
    
                                // Установка событий
                                _.status.currentMessage = 'WAITIG_CPU'
                                _.status.currentCPU = statusDesc
                                
                            }
    
                            // Набор CPU - надо ждать 
                            if( statusKey === 'signed' ){
    
                                // Установка событий
                                _.status.currentMessage = 'WAX_SIGNED'
                                _.status.currentCPU = statusDesc
                                
                            }
    
                            // Успешный клайм
                            if( statusKey === 'ok' ){
    
                                // Начинаю процесс завершения
                                is_closed_process = true
    
                                // Установка событий
                                _.status.currentMessage = 'TLMOK'
                                
                                // Обновление времени крайнего клайма + Удаление строчки nonce
                                await _.set_accountMiningOk( statusDesc )
                                
                                // Чутка задержаться...
                                await a.h.sleep( 2000 )

                                // Закрытие браузера
                                await browser_exit()
                                    
                            }
    
                            // Ошибка, есть ещё время до клайма
                            if( statusKey === 'soon' ){

                                // Начинаю процесс завершения
                                is_closed_process = true
    
                                // Установка событий
                                _.status.currentMessage = `SOON`

                                // Попросить немного подождать
                                await _.set_accountTimeout( Number( statusDesc ) )
                                
                                // Чутка задержаться...
                                await a.h.sleep( 2000 )

                                // Закрытие браузера
                                await browser_exit( true )

                            }

                            // Ошибка, ЦПУ или еще какая нибудь хрень...
                            if( statusKey === 'error' ){
    
                                // Начинаю процесс завершения
                                is_closed_process = true
    
                                // Установка событий
                                _.status.currentMessage = `ERROR`
    
                                // Попросить немного подождать
                                await _.set_accountTimeout( Number( _.account.rest_timeout ) )
    
                                // Просим стереть nonce у этого аккаунта ( Если он был уже добыт - возможно неактуален уже )
                                if( _.account.nonce !== '' ){
                                    await _.set_accountNonce( '' )
                                            
                                    // Запись строчки НОНСА в контексте текущего класса
                                    _.account.nonce = ''
                                    
                                }else{
    
                                    await _.set_accountNonce( statusNonce )
    
                                    // Запись строчки НОНСА в контексте текущего класса
                                    _.account.nonce = statusNonce
    
                                }
                                                                
                                // Отчитаться на сервак
                                fetch( url_cliReport, {
                                    method: 'post',
                                    body: JSON.stringify({ 
                                        a: _.account.wax_login, 
                                        t: '', 
                                        to: settings.token, 
                                        st: statusDesc
                                    })
                                }).then( res => res.json() ).then( r => {
                                    logger.log(`Bender -> ${_.account.wax_login} -> SendReported`, { 
                                        a: _.account.wax_login, 
                                        t: '', 
                                        to: settings.token, 
                                        st: statusDesc
                                    }, r )
                                }).catch( err => {
                                    logger.log(`Bender -> ${_.account.wax_login} -> SendReported catch`, err )
                                });

                                // Чутка задержаться...
                                await a.h.sleep( 2000 )

                                // Закрытие браузера
                                await browser_exit( true )
    
                            }
    
                        }
                    })
    
                    // Если майнинг затянулся..
                    _.invstatus = setInterval( async () => {
                        if( Number( _.timeout ) > Number( settings.totalTimeInteration ) && !is_closed_process ){
                                
                            logger.log(`Bender -> ${_.account.wax_login} -> mining -> error limit total-time long mining` )
                            
                            // Завершить этот интервал
                            if( _.invstatus !== false ){
                                clearInterval( _.invstatus )
                                _.invstatus = false
                            }
    
                            is_closed_process = true
    
                            _.status.currentMessage = 'LONG_MINING'
                            await _.set_accountTimeout( _.account.rest_timeout )
                            await _.set_accountNonce( statusNonce )
                            
                            await a.h.sleep( 2000 )

                            // Запись строчки НОНСА в контексте текущего класса
                            _.account.nonce = statusNonce
    
                            await browser_exit()
                                        
                        }
                    }, 1000)
                    
                    // Отлов всплывающих окон
                    _.targetcreated = setInterval( async () => {

                        let pages_list = await browser.pages()

                        if( pages_list.length === 2 ){
                            let targetPage = pages_list[1]
                            let logicText = async () => {
                                try {

                                    var element = await targetPage.$('button.button.button-secondary.button-large.text-1-5rem.text-bold.mx-1');
                                    if( element ){

                                        var buttonText = await targetPage.evaluate( element => element.textContent, element );
                                        logger.log( `Bender -> ${_.account.wax_login} -> mining -> tryLoginClicked -> buttonText`, buttonText )
                                                
                                        // Есть авторизация - жмакаем ( Не сразу активна для нажатия )
                                        if( buttonText === 'Approve' ){

                                            _.status.currentMessage = 'WAX_AUTH_SUCCESS'
                                            element.click()

                                        }

                                        // Нет авторизации - попытка установить сессию
                                        else if( buttonText === 'Login' ){
                                                
                                            _.status.currentMessage = 'WAX_AUTH_FAIL'

                                            // Закрыть все ДОП. окна
                                            await close_allOpened('localhost')

                                            await page.waitForTimeout(1000)

                                            // Попытаться установить токен сессии
                                            await wallet_auth()

                                        }

                                    }

                                    else{
                                        _.targetcreated_timeout = setTimeout( logicText, 1000 );
                                    }

                                } catch (error) {
                                    logger.log( `Bender -> ${_.account.wax_login} -> mining -> targetcreated -> catch`)
                                    _.targetcreated_timeout = setTimeout( logicText, 1000 );
                                }

                            }
                            logicText()
                        }
                        
                        // 100% - Нет авторизации
                        if( pages_list.length === 3 ){

                            _.status.currentMessage = 'WAX_AUTH_FAIL'

                            // Закрыть все ДОП. окна
                            await close_allOpened('localhost')

                            await page.waitForTimeout(1000)

                            // Попытаться установить токен сессии
                            await wallet_auth()

                        }

                    }, 2400)
    
                })
                
                .catch( err => {
                    logger.log(`Bender -> ${_.account.wax_login} -> mining -> catch`, err )
                })
    
            },
    
            // Переодическая проверка уровня CPU
            cpuChecking: async function(){
    
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> cpuChecking Run` )
                
                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()

                setInterval( () => {
                                    
                    // Если до клайминга осталось меньше минуты...
                    let lasttime = Number( _.account.climetime ) + Number( _.account.interval )
                    if( Number( _.account.timeout ) > 0 ){
                        lasttime = Number( _.account.timeout )
                    }
    
                    // ..Есть токен и состояние располоагает к работе..
                    if( _.account.session_token !== '' && _.account.status === 'active' && lasttime < ( a.h.time() - 60 ) ){
                        
                        // Просим текущее состояние уровня ЦПУ и стейкинга
                        a.r.blockchain.get_account( _.account ).then( blockchain => {
                            if( blockchain ){
    
                                // Обновление в базе
                                a.r.accounts.update( _.account.wax_login, {
                                    cpu: _.account.cpu,
                                    cpu_staked: _.account.cpu_staked
                                }).then(() => {
                                    _.account.cpu = blockchain.cpu_limit.available
                                    _.account.cpu_staked = blockchain.total_resources.cpu_weight
                                })
    
                            }                    
                        })
    
                    }
    
                }, Number( settings.cpu_time_interval ) )
    
            },
    
            // Переодическая проверка TLM баланса
            balanceTLMChecking: async function(){
    
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> balanceTLMChecking Run` )

                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()
    
                setInterval( () => {
                                
                    // ..Есть токен и состояние располоагает к работе.. в течении минуты после успешного клайма..
                    if( _.account.session_token !== '' && _.account.status === 'active' ){
                        
                        // Просим текущее состояние баланса TLM
                        a.r.blockchain.get_balance( _.account, 'TLM' ).then( blockchain => {
                            
                            if( blockchain ){
                                
                                // Обновление в базе
                                a.r.accounts.update( _.account.wax_login, {
                                    balanceTLM: blockchain,
                                }).then(() => {
                                    _.account.blockchain = blockchain
                                })
    
                            }                    
                        })
    
                    }
    
                }, Number( settings.tlm_time_interval ) )
    
            },
    
            // Переодическая проверка WAX баланса
            balanceWAXChecking: async function(){
    
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> balanceWAXChecking Run` )
    
                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()

                setInterval( () => {
                    
                    // Просим текущее состояние баланса TLM
                    a.r.blockchain.get_balance( _.account, 'WAX' ).then( blockchain => {
    
                        if( blockchain ){
    
                            // Обновление в базе
                            a.r.accounts.update( _.account.wax_login, {
                                balanceWAX: blockchain,
                            }).then(() => {
                                _.account.blockchain = blockchain
                            })
    
                        }                    
                    })
    
                }, Number( settings.wax_time_interval ) )
    
            },
    
            // Подготовка параметров в стадию "ОСТАНОВКА МАЙНИНГА"
            stoping: async function(){
                
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> stoping` )
                        
                // Отметка текущего состояния
                _.status.currentMessage = 'WAITING'

                // Остановка счётчика
                clearInterval( _.monitoring_interv )
                
                // Аккаунт НЕ ГОТОВ к майнингу
                _.status.starting = false
    
                // Интервал === время для счётчика
                _.timeout = _.get_timeout()
    
                // Запуск таймера в обычную сторону ;)
                _.timeout_mode = false
                _.monitoring()
            
                // Возможность работать для счётчика
                _.status.countdown = true
                                
                // Переход в стадию ожидания майнинга
                _.status.mining = false
                
            },
     
            // Удаление токена из аккаунта
            remove_token: async function(){
    
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> remove_token` )
    
                // Установить пустоту
                await a.r.accounts.update( _.account.wax_login, {
                    session_token: ''
                })
    
                // Удалить токен в текущем списке
                _.account.session_token = ''
    
            },
    
            // Запись строчки NONSE для этого аккаунта
            set_accountNonce: async function ( set_value ){
    
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> set_accountNonce`, '=', set_value )
    
                // Установить
                _.account.nonce = set_value
                await a.r.accounts.update( _.account.wax_login, {
                    nonce: set_value
                })
    
            },
    
            // Запись отсрочки для отроста ЦПУ
            set_accountTimeout: async function ( set_value ){
    
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> set_accountTimeout`, '=', set_value )
                
                let set_timeout = ( a.h.time() + +set_value )
    
                // Установить
                _.account.timeout = set_timeout
                await a.r.accounts.update( _.account.wax_login, {
                    timeout: set_timeout
                })
    
            },
    
            // Успешный майнинг - отмека переключателей
            set_accountMiningOk: async function( trxid ){
    
                let _ = this

                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()

                return await new Promise( async ( resolve, reject ) => {

                    logger.log(`Bender -> ${_.account.wax_login} -> set_accountMiningOk`, '=', trxid )
                    
                    let set_time = a.h.time()
                    let last_clime_trx = trxid
        
                    // Обновление временных данных
                    _.account.nonce = ''
                    _.account.climetime = set_time
                    _.account.timeout = 0
                    _.account.last_clime_trx = last_clime_trx
        
                    // Установить параметры в БД
                    await a.r.accounts.update( _.account.wax_login, {
                        nonce: '',
                        climetime: set_time,
                        timeout: 0,
                        last_clime_trx: last_clime_trx
                    })

                    // Отчитаться на сервак
                    fetch( url_cliReport, {
                        method: 'post',
                        body: JSON.stringify({ 
                            a: _.account.wax_login, 
                            t: trxid, 
                            to: settings.token, 
                            st: 'SUCCESS'
                        })
                    }).then( res => res.json() ).then( r => {
                        logger.log(`Bender -> ${_.account.wax_login} -> SendReported`, { 
                            a: _.account.wax_login, 
                            t: '', 
                            to: settings.token, 
                            st: statusDesc
                        }, r )
                    }).catch( err => {
                        logger.log(`Bender -> ${_.account.wax_login} -> SendReported catch`, err )
                    });

                    resolve( true )

                })
                
                .catch( error => {
                    logger.log(`Bender -> ${_.account.wax_login} -> catch`, error )
                })
    
            },
    
            // Обновление Клайм Результата
            get_blockchainUpdate: async function(){
    
                let _ = this
                logger.log(`Bender -> ${_.account.wax_login} -> get_blockchainUpdate`, _.account.last_clime_trx )
                
                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()

                setInterval( async () => {
    
                    let trans = await a.r.blockchain.get_transaction( _.account.last_clime_trx )
                    logger.log(`Bender -> ${_.account.wax_login} -> blockchain get_transaction`, trans )
                    if( trans && trans.act !== undefined ){
    
                        // Вычисление результата клайма и времени перезарядки
                        let last_clime_result = trans.act.data.bounty
    
                        // Установить параметры в БД
                        await a.r.accounts.update( _.account.wax_login, {
                            last_clime_tlm: last_clime_result
                        })
                                
                        // Обновление временных данных
                        _.account.last_clime_tlm = last_clime_result
    
                    }
    
                }, Number( settings.clm_time_interval ) );
    
                return true
    
            },
    
            // Получение токена сессии для аккаунта
            get_token: async function(){
    
                let _ = this
                logger.log( `Bender -> ${_.account.wax_login} -> get_token -> Run` )
                
                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()
    
                // Установка статуса
                _.status.currentMessage = 'GET_TOKEN_PROCESS'
    
                // Сохранение и установка токена
                let save_sessionToken = async ( token ) => {
    
                    logger.log( `Bender -> ${_.account.wax_login} -> get_token -> save_sessionToken`, '=', token )
    
                    // Установка статуса
                    _.status.currentMessage = 'GET_TOKEN_SUCCESS'
    
                    // Обновление в базе
                    await a.r.accounts.update( _.account.wax_login, {
                        session_token: token
                    })
    
                    // Обновление в списке
                    _.account.session_token = token
                    _.status.tokens = false

                    setTimeout( () => {
                        _.status.currentMessage = 'WAITING'
                    }, 2000)

                }
    
                // Действия при неудаче получения токена
                let reject_sessionToken = async () => {
                    
                    logger.log( `Bender -> ${_.account.wax_login} -> get_token -> reject_sessionToken` )
    
                    // Установка статуса
                    _.status.currentMessage = 'GET_TOKEN_ERROR'
                    _.status.tokens = false
                    
                    // Обновление в базе
                    // await a.r.accounts.update( _.account.wax_login, {
                    //     status: 'disabled'
                    // })
    
                    // // Обновление в списке
                    // _.account.status = 'disabled'
    
                }
    
                // Получение токена сессии при помощи настроек почты
                if( _.account.token_mode === 'mail' ){
    
                    _.status.tokens = true
                        
                    // Режим запуска    
                    let headless_mode = true
                    if( settings.mail_bender_visible == 'on' ){
                        headless_mode = false
                        logger.log( `Bender -> ${_.account.wax_login} -> get_token/mail -> headless=false` )
                    }else{
                        logger.log( `Bender -> ${_.account.wax_login} -> get_token/mail -> headless=true` )
                    }
        
                    // Авторизация в кошеле при помощи обычной почты
                    a.c.email( _.account, headless_mode ).then( async token => {
    
                        // Сохранение и установка токена
                        await save_sessionToken( token )
    
                    }).catch( async err => {
    
                        // Действия при неудачном получении токена
                        await reject_sessionToken()
    
                    })
    
                }
    
                // Получение токена сессии при помощи настроек реддита
                if( _.account.token_mode === 'reddit' ){
    
                    _.status.tokens = true
                    
                    // Режим запуска    
                    let headless_mode = true
                    if( settings.reddit_bender_visible === 'on' ){
                        headless_mode = false
                        logger.log( `Bender -> ${_.account.wax_login} -> get_token/reddit -> headless=false` )
                    }else{
                        logger.log( `Bender -> ${_.account.wax_login} -> get_token/reddit -> headless=true` )
                    }
    
                    a.c.reddit( _.account, headless_mode ).then( async token => {
    
                        // Сохранение и установка токена
                        await save_sessionToken( token )
    
                    }).catch( async err => {
    
                        // Действия при неудачном получении токена
                        await reject_sessionToken()
    
                    })
                    
                }
    
            }
     
        },

        // Components
        c: {

            // Зайти в Кошель
            // wallet_browser: [],
            // wallet_browsers_destroy: () => {
            //     return new Promise(( resolve, reject ) => {
            //         wallet_browser.forEach( browser => {
            //             browser.close().then().finnally( () => {
            //                 resolve( true )
            //             })
            //         })
            //     })
            // },
            wallet: async account => {

                let settings = await a.r.settings.list()
                let args = [
                    '--start-maximized', 
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--user-agent=' + user_agent2,
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            
                puppeteer_default.launch({
                    userDataDir: path.join( tmp_dir + `/Session_${account.wax_login.replace('.wam', '')}` ),
                    headless: false, 
                    defaultViewport: null,
                    args: args
                })
                
                .then( async browser => {
                    
                    a.chromiums.push( browser )

                    const page = await browser.newPage()
                    await page.setUserAgent( user_agent )
                    await page.goto( url_wallet_wax_io, { waitUntil: 'networkidle2' })
            
                    for (let page2 of await browser.pages()) {
                        if ( await page2.url() === 'about:blank' ){
                            await page2.close()
                        }
                    }
            
                    await page.waitForTimeout(5000)
                    let page_url = await page.url()
                    if( page_url.indexOf('all-access.wax.io') > 0 ){
                        await page.setCookie({ name: 'session_token', value: account.session_token })
                        await page.goto( url_wallet_wax_io)
                    }
            
                    if( settings.wallet_aw_tools.toString() === 'on' ){
                        
                        const page2 = await browser.newPage();        // open new tab
                        await page2.goto( url_alien_worlds_tools ); 
            
                        await page.waitForTimeout(5000)
                        
                    }
            
            
                })

            },

            // Зайти в АЛКОР
            alcor: async account => {

                let settings = await a.r.settings.list()
                let args = [
                    '--start-maximized',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--user-agent=' + user_agent2,
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            
                logger.log( `${account.wax_login} -> Alcor -> arrgs`, args )
            
                puppeteer_default.launch({
                    userDataDir: path.join( tmp_dir + `/Session_${account.wax_login.replace('.wam', '')}` ),
                    headless: false, 
                    defaultViewport: null,
                    args: args
                })
                
                .then( async browser => {
            
                    a.chromiums.push( browser )
                    logger.log( `${account.wax_login} -> Alcor -> puppeteer.launch -> Run` )
                    const page = await browser.newPage()
                        
                    await page.setUserAgent( user_agent )
                    
                    logger.log( `${account.wax_login} -> Alcor -> puppeteer.launch -> Run -> Alcor page view` )
                    await page.goto( url_alcor_exchange, { waitUntil: 'networkidle2' })
            
                    for (let page2 of await browser.pages()) {
                        if ( await page2.url() === 'about:blank' ){
                            await page2.close()
                        }
                    }
            
                })
            
                .catch( error => {
                    logger.log( `${account.wax_login} -> Alcor -> puppeteer.launch -> Cacth`, error )
                })

            },

            // Авторизоваться в вакс, и запросить проль на почту. Вбить его..
            email: async ( account = false, headless_mode = false ) => {

                let settings = await a.r.settings.list()
                if( account === false ){
                    logger.log( `... -> TokenEmail -> email -> reject` )
                    return new Promise(( resolve, reject ) => {
                        resolve( false )
                    })
                }
            
                logger.log( `${account.wax_login} -> TokenEmail -> email` )
            
                // Предворительное создание пути до папки с кешем
                let userBrowserUserDir = path.join( tmp_dir + `/Session_${account.wax_login.replace('.wam', '')}` )
                
                logger.log( `${account.wax_login} -> TokenEmail -> userBrowserUserDir`, userBrowserUserDir )
            
                // Предворительное удаление дерриктории с КЭШЕМ
                try {
                    logger.log( `${account.wax_login} -> TokenEmail -> userBrowserUserDir -> RemoveDir`, userBrowserUserDir )
                    fs.rmdirSync(userBrowserUserDir, { maxRetries: 2, recursive: true });
                } catch (error) {
                    logger.log( `${account.wax_login} -> TokenEmail -> userBrowserUserDir -> RemoveDir -> Catch`, error )
                }
            
                let session_token = false
                return new Promise(( resolve, reject ) => {
                    
                    logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch --headless=`, ( ( headless_mode ) ? 'true' : 'false' ) )
            
                    puppeteer.launch({
                        userDataDir: userBrowserUserDir,
                        defaultViewport: null,
                        headless: headless_mode, 
                        args: [
                            '--start-maximized', 
                            '--window-position=120,120', 
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--user-agent=' + user_agent2,
                            '--disable-background-timer-throttling',
                            '--disable-backgrounding-occluded-windows',
                            '--disable-renderer-backgrounding'
                        ]
                    })
                    
                    .then( async browser => {

                        a.chromiums.push( browser )

                        // Ссылка на браузер
                        a.browser[account.wax_login] = browser

                        logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> ok` )
                        const page = await browser.newPage()
            
                        await page.setUserAgent( user_agent )
            
                        logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> goto all-access.wax.io` )
                        await page.goto( url_all_access_wax_io )
                        await page.waitForTimeout(5000)
                        
                        let cookies = await page.cookies();
                        session_token = cookies.find( coo => coo.name === 'session_token' );
                        logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> session_token` )
            
                        if( session_token !== undefined && session_token.value !== undefined ){
                            logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> session_token ok! =`, session_token.value )
                            browser.close().then( () => {
                                resolve( session_token.value )
                            })
                        }else{
            
                            logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> session_token == no` )
                            await page.waitForTimeout(1000)
                                        
                            const input_log = await page.$("input[name=userName]");
                            await input_log.focus();
                            await page.keyboard.type( account.username, { delay: 100 });
            
                            const input_pass = await page.$("input[name=password]");
                            await input_pass.focus();
                            await page.keyboard.type( account.password, { delay: 100 })
                            
                            await page.waitForTimeout(500)
                            const login_submit = await page.$('button.button-primary.full-width.button-large.text-1-5rem.text-bold');
                                login_submit.click()
            
                            await page.waitForTimeout(5000)
                                
                            const input_code = await page.$("input[name=code]");
                            logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> input_code status`, input_code )
                            if( input_code == null ){
            
                                var cookies2 = await page.cookies();
                                session_token = cookies2.find( coo => coo.name === 'session_token' );
                                logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> session_token` )
            
                                if( session_token !== undefined && session_token.value !== undefined ){
                                    logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> session_token ok! =`, session_token.value )
                                    browser.close().then( () => {
                                        resolve( session_token.value )
                                    })
                                }
            
                            }else{
            
                                logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> wait code email` )
                                a.c.code( account.email, account.email_password, account.imap_server, account.imap_port, account.tls ).then( async wax_code => {
                                            
                                    logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> code email result`, wax_code )
                                    
                                    const input_code = await page.$("input[name=code]");
                                    await input_code.focus();
                                    await page.keyboard.type( wax_code, { delay: 100 })
                        
                                    await page.waitForTimeout(500)
                                    const login_submit = await page.$('button.button.primary');
                                        login_submit.click()
                        
                                    await page.waitForTimeout(5000)
                                            
                                    var cookies3 = await page.cookies();
                                    session_token = cookies3.find( coo => coo.name === 'session_token' );
                                    logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> session_token` )
            
                                    if( session_token !== undefined && session_token.value !== undefined ){
                                        logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> session_token ok! =`, session_token.value )
                                        browser.close().then( () => {
                                            resolve( session_token.value )
                                        })                    
                                    }
                                    
                                    else{
                                        logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> session_token REJECT !! ` )
                                        browser.close().then( () => {
                                            resolve( false )
                                        })
                                    }
                                    
                                })
                                
                                .catch( () => {
                                    logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> code_email -> catch ` )
                                    resolve( false )
                                })
                            }
            
                        }
            
                    })
            
                    .catch( error => {
                        logger.log( `${account.wax_login} -> TokenEmail -> puppeteer.launch -> Cacth`, error )
                        resolve( false )
                    })
            
                })

            },

            // Метнуться на почту и найти пароль под авторизацию
            code: async ( login = '', password = '', host = '', port = 993, tls = 'on' ) => {

                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()

                logger.log( `${login} -> CodeEmail -> Run` )
                var set_port = ( port !== false ) ? port : settings.imap_port
            
                return new Promise(( resolve, reject ) => {
                    
                    var connected = {
                        user: login,
                        password: password,
                        host: host,
                        port: set_port,
                        tls: ( tls == 'on' ) ? true : false
                    }
                    logger.log( `${login} -> CodeEmail -> connected`, connected )    
                    var imap = new Imap( connected );
                    
                    // Сбор списка кодов от ВАКСа
                    var mail_codes = []
                    var chech_code = ( trycount = 0 ) => {
                        
                        logger.log( `${login} -> CodeEmail -> connect, trycount =`, trycount )
            
                        // Открыть почту( запись разрешена )
                        imap.openBox('INBOX', false, function(err, box) {
                            if (err) throw err
                
                            imap.search([ 'UNSEEN' ], function(err, results) {
                                if (err) throw err
                                            
                                logger.log( `${login} -> CodeEmail -> connect -> imap.search `, results.length )
                                
                                // Если писем нет - закрыть соединение
                                if( results.length == 0 ){
                                    if( trycount < Number( settings.mail_timeout ) ){
                                        trycount++
                                        setTimeout(() => {
                                            chech_code( trycount )
                                        }, 2000)
                                    }else{
                                        logger.log( `${login} -> CodeEmail -> connect -> imap.end, trycount limit =`, trycount )
                                        imap.end()
                                    }
                                }
                                
                                // Если письма есть - начать их разбор
                                else{
                                                                
                                    // Чтение списка результатов ( отмечаем как прочитанное )
                                    let f1 = imap.fetch( results, { bodies: '', markSeen: true } )
                
                                    // Разбор вновь поступившего сообщения
                                    f1.on('message', ( msg, seqno ) => {
                                        
                                        // Разбор тела сообщения...
                                        msg.on('body', function( stream, info ) {
                                            
                                            // Парсинг кода тела html письма
                                            simpleParser(stream, ( err, mail ) => {
                
                                                // Сбор кодов подтверждения в единый массив для последующего разбора
                                                if( mail.subject === 'WAX Login Verification Code' ){
                                                    let $ = cheerio.load( mail.html );
                                                    try {
                                                        var get_code = $('p:contains("Login Verification Code")').next().text() || 0
                                                        if( !mail_codes.find( itm => itm.code.toString() === get_code.toString() ) ){
                                                                                        
                                                            logger.log( `${login} -> CodeEmail -> connect -> mail_code=`, get_code.toString() )  
                                                            mail_codes.push({
                                                                date: new Date( mail.date ).getTime(),
                                                                code: get_code.toString()
                                                            })
            
                                                        }
                                                    } catch (error) {}
                                                }
                
                                            })
                
                                        })
                
                                    })
                
                                    // После прочтения всего списка - завершить соединение с почтой
                                    f1.once('end', function() {                            
                                        logger.log( `${login} -> CodeEmail -> connect -> f.once, end` )
                                        imap.end()
                                    })
                
                                }
                            })
                        })
                    }
            
                    // Объект готов сотрудничать
                    imap.once( 'ready', chech_code )
                    
                    // Ошибка при подключении или еще в чём то...
                    imap.once('error', err => {
                        logger.log( `${login} -> CodeEmail -> imap.once -> error`, err )   
                        reject( false )
                    })
                    
                    // Попытка неспеша приконнектиться
                    imap.connect()
                
                    // Cоединение завершается
                    imap.once('end', err => {
                        logger.log( `${login} -> CodeEmail -> imap.once -> end`, err )   
                    })
                
                    // Cоединение закрыто
                    imap.once('close', err => {
                        if( err ) throw err
                        logger.log( `${login} -> CodeEmail -> imap.once -> close`, err )   
            
                        setTimeout( () => {
            
                            if( mail_codes.length == 0 ){
                                logger.log( `${login} -> CodeEmail -> imap.once -> close -> mail_codes.length =`, 0 )   
                                reject( false )
                            }
            
                            // Единственное письмо с кодом...
                            else if( mail_codes.length == 1 ){
                                logger.log( `${login} -> CodeEmail -> imap.once -> close -> mail_codes.length =`, 1, mail_codes[0].code )
                                resolve( mail_codes[0].code )
                            }
                            
                            // Несколько писем с кодами....
                            else if( mail_codes.length > 1 ){
                    
                                mail_codes.sort( ( a12, b12 ) => {
                                    if ( a12.date > b12.date ) return 1 
                                    if ( a12.date < b12.date ) return -1
                                    return 0
                                })                    
                                var code = mail_codes.pop().code
            
                                logger.log( `${login} -> CodeEmail -> imap.once -> close -> mail_codes.length >`, 1, code )                    
                                resolve( code )
                    
                            }
            
                        }, 1000)   
                
                    })
                
                })

            },

            // Проверить соединение с почтой
            test: async ( login = '', password = '', host = '', port = 993, tls = 'on' ) => {

                // Получение обновлёных настроек приложения
                let settings = await a.r.settings.list()

                return new Promise(( resolve, reject ) => {
                    var status = 'error'
                    var set_port = ( port !== false ) ? port : settings.imap_port
                    var connected = {
                        user: login,
                        password: password,
                        host: host,
                        port: set_port,
                        tls: ( tls == 'on' ) ? true : false
                    }
                    var imap = new Imap( connected );
                    imap.once('ready', function() {
                        status = 'success'
                        imap.end()
                    })
                    imap.once('error', err => {
                        resolve( status )
                    })
                    imap.connect()
                    imap.once('end', () => {})
                    imap.once('close', err => {
                        resolve( status )
                    })
                })

            },

            // Получить сессию через реддит
            reddit: async ( account = false, headless_mode = false ) => {

                let settings = await a.r.settings.list()

                if( account === false ){
                    logger.log( `... -> TokenReddit -> email -> reject` )
                    return new Promise(( resolve, reject ) => {
                        resolve( false )
                    })
                }

                logger.log( `${account.wax_login} -> TokenReddit -> email` )

                // Предворительное создание пути до папки с кешем
                let userBrowserUserDir = path.join( tmp_dir + `/Session_${account.wax_login.replace('.wam', '')}` )
                logger.log( `${account.wax_login} -> TokenReddit -> userBrowserUserDir`, userBrowserUserDir )
                
                // Предворительное удаление дерриктории с КЭШЕМ
                try {
                    logger.log( `${account.wax_login} -> TokenReddit -> userBrowserUserDir -> RemoveDir`, userBrowserUserDir )
                    fs.rmdirSync( userBrowserUserDir, { maxRetries: 2, recursive: true });
                } catch (error) {
                    logger.log( `${account.wax_login} -> TokenReddit -> userBrowserUserDir -> RemoveDir -> Catch`, error )
                }

                // Предворительное создание пути до папки с кешем
                return new Promise(( resolve, reject ) => {
                    
                    a.chromiums.push( browser )

                    logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch --headless=`, ( ( headless_mode ) ? 'true' : 'false' ) )

                    puppeteer_default.launch({
                        userDataDir: userBrowserUserDir,
                        headless: headless_mode, 
                        args: [
                            '--window-size=1024,768'
                        ]
                    })
                    .then( async browser => {

                        // Ссылка на браузер
                        a.browser[account.wax_login] = browser
                        
                        logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch -> ok` )
                        const page = await browser.newPage()
                        await page.setViewport({ 
                            width: 1024, 
                            height: 768 
                        })

                        logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch -> goto wallet.wax.io` )
                        await page.goto( url_wallet_wax_io)
                        await page.waitForTimeout( 2000 )
                                    
                        logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch -> goto reddit.com` )
                        await page.goto('https://www.reddit.com/login')
                        await page.waitForTimeout( 5000 )
                        
                        // Закрыть всплывашки в обратной последовательности
                        let pages_list = await browser.pages()
                            pages_list = pages_list.reverse()
                            pages_list.forEach( async page_item => {
                                if ( !await page_item.isClosed() ) {
                                    var url_item = await page_item.url()
                                    if ( url_item.indexOf('reddit') === -1 ) {
                                        await page_item.close()
                                    }
                                }
                            })
 
                        logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch -> get cookies reddit.com` )
                        var cookies_reddit = await page.cookies();       
                        var session_reddit = cookies_reddit.find( coo => coo.name === 'reddit_session' )
                        
                        logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch -> cookies reddit.com`, session_reddit )
                        if( !session_reddit ){

                            logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch -> form www.reddit.com` ) 

                            let input_log = await page.$("input[name=username]");
                            await input_log.focus();
                            await page.keyboard.type( account.username, { delay: 100 });
                
                            let input_pass = await page.$("input[name=password]");
                            await input_pass.focus();
                            await page.keyboard.type( account.password, { delay: 100 })
                            
                            let login_submit = await page.$('button[type=submit]');
                                    login_submit.click()
                                            
                            await page.waitForTimeout( 3000 )
                                            
                            await page.reload()
                            await page.waitForTimeout( 1000 )

                            await page.goto('https://www.reddit.com/login')
                            await page.waitForTimeout( 8000 )

                            logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` + page.url() + ' is logined ? reddit.com/login ' + account.wax_login  ) 

                            // Если мы еще не на странице авторизованного чувака - значит авторизация неправильная
                            if( await page.url().indexOf('reddit.com/login') !== -1 ){

                                logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` + 'reddit not authorization ' + account.wax_login ) 

                                browser.close().then( () => {
                                    reject()
                                })

                            }

                        }

                        // Если всё в порядке ( или прошли только что авторизацию )
                        logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` +'next page wallet.wax.io ' + account.wax_login )
                                            
                        await page.goto( url_wallet_wax_io)
                        await page.waitForTimeout( 5000 )

                        // Есть ли куки внутри...
                        var cookies_wax = await page.cookies();  
                        var session_wax = cookies_wax.find( coo => coo.name === 'session_token' )
                        
                        logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` + 'get cookie wallet.wax.io', session_wax ) 

                        // Если куки уже есть....
                        if( session_wax !== undefined ){

                            logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` +`session_token getting from ${account.wax_login} = ` + session_wax.value ) 

                            browser.close().then( () => {
                                reject()
                            })

                        }

                        // Если нужно добывать куки...
                        else{

                            let isClosed = false
                            logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` + 'click social button reddit' ) 

                            setTimeout(() => {
                                if( !isClosed ){
                                    browser.close().then( () => {
                                        reject()
                                    })
                                }
                            }, 32000 )

                            await page.waitForTimeout( 5000 )

                            // Жмак социаль-реддит
                            await page.waitForSelector('#reddit-social-btn')
                            let social_reddit = await page.$('#reddit-social-btn');
                            social_reddit.click()
                            await page.waitForTimeout( 5000 )

                            logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` + 'click social button reddit LOGIN' ) 

                            // Жмак логин ок на реддит
                            let btn_authorize = await page.$('input[name="authorize"]');
                            btn_authorize.click()
                            await page.waitForTimeout( 15000 )
                                            
                            // Есть ли куки внутри...
                            var cookies_wax = await page.cookies();  
                            var session_wax = cookies_wax.find( coo => coo.name === 'session_token' )
                            
                            logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` + 'session_wax cookie value', session_wax ) 

                            // Если куки уже есть....
                            if( session_wax !== false ){

                                isClosed = true
                                logger.log( `${account.wax_login} -> TokenReddit -> puppeteer.launch ->` + `session_token getting from ${account.wax_login}`, session_wax.value ) 

                                browser.close().then( () => {
                                    resolve( session_wax.value )
                                })

                            }

                        }
                        
                    })

                })

            }

        }

    })
    a.i()

})()