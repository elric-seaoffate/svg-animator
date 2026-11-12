package generator

import (
	"strings"
	"testing"
)

func TestStandaloneHTMLTransparencyAttributes(t *testing.T) {
	html := BuildStandaloneHTMLWithBackground("Test Title", 800, 600, "<path d='M0 0'/>", true, "#123456")
	if !strings.Contains(html, `data-bg-transparent="true"`) {
		t.Errorf("expected html to contain data-bg-transparent=\"true\"")
	}
	if !strings.Contains(html, `data-bg-color="#123456"`) {
		t.Errorf("expected html to contain data-bg-color=\"#123456\"")
	}

	htmlOpaque := BuildStandaloneHTMLWithBackground("Test Title", 800, 600, "<path d='M0 0'/>", false, "#abcdef")
	if !strings.Contains(htmlOpaque, `data-bg-transparent="false"`) {
		t.Errorf("expected html to contain data-bg-transparent=\"false\"")
	}
	if !strings.Contains(htmlOpaque, `data-bg-color="#abcdef"`) {
		t.Errorf("expected html to contain data-bg-color=\"#abcdef\"")
	}
}
