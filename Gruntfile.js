var shim = require('browserify-shim');

module.exports = function(grunt) {

  // Project configuration
  grunt.initConfig({

    meta: {
      scripts: [
        'js/**/*.js'
      ],
      styles: [
        'sass/**/*.scss',
        'css/**/*.css'
      ]
    },

    // Combine JS modules using Browserify
    browserify2: {
      options: {
        entry: './js/main.js',
        beforeHook: function(bundle) {
          // Shim 3rd party libraries not in `node_modules`
          shim(bundle, {
            'jquery': {path: 'components/jquery/jquery.js', exports: 'jQuery'},
            'fastclick': {path: 'components/fastclick/lib/fastclick.js', exports: 'jQuery'},
            'jquery-jail': {path: 'components/JAIL/src/jail.js', exports: 'jail'}
          });
        }
      },
      debug: {
        compile: 'debug/app.js',
        // For source maps
        debug: true
      },
      build: {
        compile: 'build/app.js'
      }
    },

    // Compile Sass files to CSS
    compass: {
      options: {
        require: 'compass-inuit',
        sassDir: 'sass'
      },
      debug: {
        options: {
          cssDir: 'debug',
          // For source maps
          debugInfo: true,
          outputStyle: 'expanded'
        }
      },
      build: {
        options: {
          cssDir: 'build'
        }
      }
    },

    // Concatenate files
    concat: {
      debug: {
        files: {
          'debug/style.css': ['debug/main.css', 'css/pygments.css']
        }
      },
      build: {
        files: {
          'build/style.css': ['build/main.css', 'css/pygments.css']
        }
      }
    },

    // Minify CSS files
    cssmin: {
      build: {
        files: {
          'build/style.min.css': ['build/style.css']
        }
      }
    },

    // Minify JS files
    uglify: {
      build: {
        files: {
          'build/app.min.js': ['build/app.js']
        }
      }
    },

    // Watch files for changes
    watch: {
      scripts: {
        files: ['<%= meta.scripts %>'],
        tasks: ['browserify2:debug']
      },
      styles: {
        files: ['<%= meta.styles %>'],
        tasks: ['compass:debug', 'concat:debug']
      }
    },

    // Clean target directories
    clean: {
      site: ['_site'],
      debug: ['debug'],
      buildTemp: [
        'build/main.css',
        'build/style.css',
        'build/app.js'
      ]
    },

    // Run Jekyll commands
    jekyll: {
      server: {
        server : true,
        // Add the --watch flag, i.e. rebuild on file changes
        watch: true
      },
      build: {
        server: false
      }
    }

  });

  // Load tasks from plugins
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-browserify2');
  grunt.loadNpmTasks('grunt-contrib-compass');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-jekyll');

  // Compile JS & CSS, run watch to recompile on change
  grunt.registerTask('debug', function(target) {
    // Rebuild './debug'
    grunt.task.run([
      'clean:debug',
      'compass:debug',
      'browserify2:debug',
      'concat:debug'
    ]);
    // Optionally watch for changes
    if (target === 'watch') grunt.task.run('watch');
  });

  // Run Jekyll build with environment set to production
  grunt.registerTask('jekyll-production', function() {
    grunt.log.writeln('Setting environment variable JEKYLL_ENV=production');
    process.env.JEKYLL_ENV = 'production';
    grunt.task.run('jekyll:build');
  });

  // Compile and minify JS & CSS, run Jekyll build for production 
  grunt.registerTask('build', [
    'clean:site',
    'compass:build',
    'browserify2:build',
    'concat:build',
    'cssmin',
    'uglify',
    'clean:buildTemp',
    'jekyll-production'
  ]);

  // Alias to `grunt jekyll:server`
  grunt.registerTask('server', 'jekyll:server');

  grunt.registerTask('default', ['debug']);

};