module Jekyll
  class ImageTag < Liquid::Tag
    @url = nil
    @title = nil
    @caption = nil

    IMAGE_URL_WITH_TITLE_AND_CAPTION = /(\S+)(\s+)"(.*?)"(\s+)"(.*?)"/i
    IMAGE_URL_WITH_TITLE = /(\S+)(\s+)"(.*?)"/i
    IMAGE_URL = /(\S+)/i

    def initialize(tag_name, markup, tokens)
      super

      if markup =~ IMAGE_URL_WITH_TITLE_AND_CAPTION
        @url     = $1
        @title   = $3
        @caption = $5
      elsif markup =~ IMAGE_URL_WITH_TITLE
        @url   = $1
        @title = $3
      elsif markup =~ IMAGE_URL
        @url = $1
        @title = ""
      end
    end

    def render(context)
      @config = context.registers[:site].config['images'] || {}
      @config['root_url'] ||= ''
      # Only works if no trailing slash in `root_url`, and no leading in `url`
      @url = [@config['root_url'], @url].join('/')

      source = "<figure>"
      source += "<img src=\"#{@url}\" alt=\"#{@title}\">"
      source += "<figcaption>#{@caption}</figcaption>" if @caption
      source += "</figure>"

      source
    end
  end
end

Liquid::Template.register_tag('image', Jekyll::ImageTag)
